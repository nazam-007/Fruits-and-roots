import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { amountInPaise, razorpayConfig, razorpayGateway, verifyRazorpaySignature, type GatewayPayment } from "./razorpay";
import { razorpayPayments } from "./razorpayPayments";
import { logRazorpayFailure, observeRazorpay } from "./razorpayDiagnostics";

test("Razorpay diagnostics retain only allowlisted SQLSTATE and constraints", () => {
  const lines: string[] = [];
  logRazorpayFailure({ code: "23514", constraint: "payments_source_check", message: "secret", detail: "private" }, (line) => lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]!), { stage: "razorpay_order_validation", category: "database", code: "23514", constraint: "payments_source_check" });
  logRazorpayFailure({ code: "SECRET_CODE", constraint: "private_customer_reference" }, (line) => lines.push(line));
  assert.deepEqual(JSON.parse(lines[1]!), { stage: "razorpay_order_validation", category: "unknown", code: "unknown", constraint: null });
});

test("Razorpay diagnostics never serialize sensitive fields or invoke getters", () => {
  let accessed = false;
  const error = { message: "private", detail: "private", parameters: ["private"], headers: { Authorization: "private" },
    cause: "private", body: "private", key: "private", signature: "private", toJSON() { throw Error("private"); },
    get code() { accessed = true; throw Error("private"); } };
  const lines: string[] = [];
  logRazorpayFailure(error, (line) => lines.push(line));
  assert.equal(accessed, false);
  assert.equal(lines[0]!.includes("private"), false);
  assert.deepEqual(Object.keys(JSON.parse(lines[0]!)).sort(), ["category", "code", "constraint", "stage"]);
});

test("Razorpay diagnostic sink and hostile error objects cannot throw", () => {
  assert.doesNotThrow(() => logRazorpayFailure(Error("private"), () => { throw Error("broken logger"); }));
  assert.doesNotThrow(() => logRazorpayFailure(new Proxy({}, { getOwnPropertyDescriptor() { throw Error(); } }), () => {}));
  assert.doesNotThrow(() => logRazorpayFailure(null, () => {}));
});

test("Razorpay stage observation rethrows the identical failure and preserves deepest stage", async () => {
  const error = { code: "42703" };
  await assert.rejects(observeRazorpay("razorpay_database_transaction", "database", () =>
    observeRazorpay("razorpay_schema_check", "database", async () => { throw error; })), (actual) => actual === error);
  const lines: string[] = [];
  logRazorpayFailure(error, (line) => lines.push(line));
  assert.equal(JSON.parse(lines[0]!).stage, "razorpay_schema_check");
  assert.equal(await observeRazorpay("razorpay_order_persistence", "database", async () => 42), 42);
});

test("Razorpay gateway failures have a fixed category without copying provider errors", async () => {
  const error = Error("provider private response");
  await assert.rejects(observeRazorpay("razorpay_gateway_order_creation", "gateway", async () => { throw error; }));
  const lines: string[] = [];
  logRazorpayFailure(error, (line) => lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]!), { stage: "razorpay_gateway_order_creation", category: "gateway", code: "unknown", constraint: null });
});

const config = { keyId: "rzp_test_fixture", secret: "fixture-secret" };
const id = "00000000-0000-4000-8000-000000000201";
const token = "t".repeat(48);
function fixture() {
  let state = { id, total_amount: 240, item_total: "240", payment_status: "PENDING_PAYMENT", order_status: "PENDING_PAYMENT",
    tracking_token_hash: createHash("sha256").update(token).digest("hex"), payment_attempt_active: true,
    payment_source: "MANUAL_UPI", recorded_payment_status: "PENDING_PAYMENT", razorpay_order_id: null as string | null,
    razorpay_key_id: null as string | null, razorpay_payment_id: null as string | null,
    razorpay_amount_paise: null as number | null, reconciliation_required: false };
  let queue = Promise.resolve();
  let creates = 0, fetched = 0, updates = 0, published = 0;
  let remote: GatewayPayment = { id: "pay_fixture", order_id: "order_fixture", amount: 24000,
    currency: "INR", captured: true, status: "captured", amount_refunded: 0, refund_status: null };
  const db = {
    query: async () => ({ rows: [{ ...state }] }),
    connect: async () => {
      let working = { ...state };
      let release: (() => void) | undefined;
      let changes = 0;
      return { query: async (sql: string, values: unknown[] = []) => {
        if (sql === "BEGIN") return { rows: [] };
        if (sql === "COMMIT") { state = working; updates += changes; release?.(); release = undefined; return { rows: [] }; }
        if (sql === "ROLLBACK") { release?.(); release = undefined; return { rows: [] }; }
        if (sql.startsWith("SELECT")) {
          assert.ok(sql.includes("FOR UPDATE OF o,p"));
          const previous = queue; queue = new Promise<void>((done) => { release = done; });
          await previous; working = { ...state };
          return { rows: [{ ...working }] };
        }
        changes++;
        if (sql.includes("payment_source='RAZORPAY_TEST'")) {
          working.payment_source = "RAZORPAY_TEST"; working.razorpay_order_id = values[1] as string;
          working.razorpay_key_id = values[2] as string; working.razorpay_amount_paise = values[3] as number;
        } else if (sql.includes("UPDATE payments SET payment_status")) {
          working.recorded_payment_status = values[1] as string;
          working.razorpay_payment_id = values[2] as string; working.reconciliation_required = values[3] as boolean;
        } else if (sql.includes("UPDATE orders SET payment_status")) {
          working.payment_status = values[1] as string;
          if (values[2]) working.order_status = "PLACED";
        }
        return { rows: [], rowCount: 1 };
      }, release: () => { release?.(); } };
    },
  } as unknown as Pool;
  const service = razorpayPayments(db, {
    createOrder: async (amount, receipt) => { creates++; assert.equal(amount, 24000); assert.equal(receipt, id);
      return { id: "order_fixture", amount, currency: "INR" }; },
    fetchPayment: async () => { fetched++; return { ...remote }; },
  }, config, () => { published++; });
  const signature = (paymentId = "pay_fixture") => createHmac("sha256", config.secret).update(`order_fixture|${paymentId}`).digest("hex");
  return { service, signature, state: () => ({ ...state }), set: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; },
    remote: (patch: Partial<GatewayPayment>) => { remote = { ...remote, ...patch }; },
    counters: () => ({ creates, fetched, updates, published }), remotePayment: () => ({ ...remote }) };
}

test("Razorpay configuration requires test keys and explicitly rejects production and live mode", () => {
  const env = { NODE_ENV: "development", RAZORPAY_MODE: "test", RAZORPAY_KEY_ID: config.keyId, RAZORPAY_KEY_SECRET: config.secret };
  assert.deepEqual(razorpayConfig(env), { ...config, webhookSecret: undefined });
  assert.equal(razorpayConfig({ NODE_ENV: "production", RAZORPAY_MODE: "off" }), null);
  for (const patch of [{ NODE_ENV: "production" }, { RAZORPAY_MODE: "live" }, { RAZORPAY_KEY_ID: "rzp_live_fixture" },
    { RAZORPAY_KEY_SECRET: "" }, { NODE_ENV: "" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }]) assert.throws(() => razorpayConfig({ ...env, ...patch }));
});

test("callback and webhook HMACs use exact stored order/raw bytes and timing-safe comparison", () => {
  const raw = Buffer.from('{ "event": "payment.captured" }');
  const signature = createHmac("sha256", "webhook-fixture").update(raw).digest("hex");
  assert.equal(verifyRazorpaySignature(raw, signature, "webhook-fixture"), true);
  assert.equal(verifyRazorpaySignature(JSON.stringify(JSON.parse(raw.toString())), signature, "webhook-fixture"), false);
  assert.equal(verifyRazorpaySignature(raw, "bad", "webhook-fixture"), false);
  assert.equal(verifyRazorpaySignature(raw, signature, "wrong-secret"), false);
  assert.equal(amountInPaise(240), 24000);
  for (const value of [0, -1, 1.01, Number.MAX_SAFE_INTEGER]) assert.throws(() => amountInPaise(value));
});

test("server-priced order creation is serialized/idempotent and tracking-authorized", async () => {
  const f = fixture();
  await assert.rejects(f.service.start(id, "forged"));
  assert.equal(f.counters().creates, 0);
  const [a, b] = await Promise.all([f.service.start(id, token), f.service.start(id, token)]);
  assert.equal(a.razorpayOrderId, b.razorpayOrderId);
  assert.equal(a.amount, 24000);
  assert.equal(f.counters().creates, 1);
  assert.equal(f.state().payment_status, "PENDING_PAYMENT");
  f.set({ item_total: "1" }); await assert.rejects(f.service.start(id, token));
});

test("invalid callback signature cannot invoke the provider or confirm payment", async () => {
  const f = fixture(); await f.service.start(id, token);
  await assert.rejects(f.service.verify(id, token, "order_fixture", "pay_fixture", "0".repeat(64)));
  assert.equal(f.counters().fetched, 0);
  assert.equal(f.state().order_status, "PENDING_PAYMENT");
});

test("concurrent callback/webhook confirmation commits once and never regresses completed orders", async () => {
  const f = fixture(); await f.service.start(id, token);
  const results = await Promise.all([
    f.service.verify(id, token, "order_fixture", "pay_fixture", f.signature()),
    f.service.confirm(f.remotePayment()),
  ]);
  assert.ok(results.every((result) => result.paymentStatus === "PAID"));
  assert.equal(f.counters().updates, 3); // provider binding plus one payment/order pair
  assert.equal(f.counters().published, 1);
  f.set({ order_status: "COMPLETED", payment_attempt_active: false });
  await f.service.confirm(f.remotePayment());
  assert.equal(f.state().order_status, "COMPLETED");
  await f.service.confirm({ ...f.remotePayment(), status: "failed", captured: false });
  assert.equal(f.state().payment_status, "PAID");
});

test("authorized/failed payments stay pending and amount/currency/account/identity mismatches fail closed", async () => {
  for (const status of ["authorized", "failed"]) {
    const f = fixture(); await f.service.start(id, token); f.remote({ status, captured: false });
    const result = await f.service.verify(id, token, "order_fixture", "pay_fixture", f.signature());
    assert.equal(result.paymentStatus, "PENDING_PAYMENT");
    assert.equal(f.state().order_status, "PENDING_PAYMENT");
  }
  for (const patch of [{ amount: 1 }, { currency: "USD" }, { order_id: "order_wrong" }, { id: "pay_wrong" },
    { amount_refunded: 10 }, { refund_status: "partial" }]) {
    const f = fixture(); await f.service.start(id, token); f.remote(patch);
    await assert.rejects(f.service.verify(id, token, "order_fixture", "pay_fixture", f.signature()));
    assert.equal(f.state().order_status, "PENDING_PAYMENT");
  }
  const f = fixture(); await f.service.start(id, token); f.set({ razorpay_key_id: "rzp_test_other" });
  await assert.rejects(f.service.confirm(f.remotePayment()));
});

test("cancelled/expired captures are retained for reconciliation without placing orders", async () => {
  for (const status of ["CANCELLED", "EXPIRED"]) {
    const f = fixture(); await f.service.start(id, token); f.set({ payment_status: status, payment_attempt_active: false });
    const result = await f.service.confirm(f.remotePayment());
    assert.equal(result.paymentStatus, status);
    assert.equal(f.state().reconciliation_required, true);
    assert.equal(f.state().order_status, "PENDING_PAYMENT");
    await f.service.confirm(f.remotePayment());
    assert.equal(f.counters().published, 0);
  }
});

test("provider requests use fixed HTTPS endpoint, stored paise and sanitized error handling", async () => {
  const gateway = razorpayGateway(config, (async (url, init) => {
    assert.equal(String(url), "https://api.razorpay.com/v1/orders");
    assert.deepEqual(JSON.parse(init!.body as string), { amount: 24000, currency: "INR", receipt: id });
    return new Response(JSON.stringify({ id: "order_fixture", amount: 24000, currency: "INR" }), { status: 200 });
  }) as typeof fetch);
  await gateway.createOrder(24000, id);
  const broken = razorpayGateway(config, (async () => { throw new Error("private credentials"); }) as typeof fetch);
  await assert.rejects(broken.fetchPayment("pay_fixture"), { message: "Razorpay test service unavailable" });
});

test("Razorpay initial query uses application schema columns and rolls back undefined-column failure before gateway access", async () => {
  const failure = { code: "42703", message: "private provider diagnostic" };
  const statements: string[] = [];
  let released = false;
  let gatewayCalls = 0;
  const database = { connect: async () => ({
    query: async (sql: string, values?: unknown[]) => {
      statements.push(sql);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      assert.deepEqual(values, [id]);
      const schema: Record<string, Set<string>> = {
        o: new Set(["id", "total_amount", "payment_status", "order_status", "tracking_token_hash", "payment_expires_at"]),
        p: new Set(["order_id", "payment_source", "payment_status", "razorpay_order_id", "razorpay_payment_id",
          "razorpay_key_id", "razorpay_amount_paise", "reconciliation_required"]),
      };
      for (const reference of sql.matchAll(/\b([op])\.([a-z_]+)/g)) {
        assert.ok(schema[reference[1]!]!.has(reference[2]!), `Unexpected application column: ${reference[1]}.${reference[2]}`);
      }
      assert.match(sql, /FROM orders o JOIN payments p ON p\.order_id=o\.id/);
      assert.match(sql, /SUM\(quantity::bigint\*unit_price\) FROM order_items WHERE order_id=o\.id/);
      assert.match(sql, /WHERE o\.id=\$1 FOR UPDATE OF o,p/);
      assert.doesNotMatch(sql, /pg_catalog|pg_attribute|information_schema/);
      throw failure;
    },
    release: () => { released = true; },
  }) } as unknown as Pool;
  const service = razorpayPayments(database, {
    createOrder: async () => { gatewayCalls++; throw Error("must not run"); },
    fetchPayment: async () => { gatewayCalls++; throw Error("must not run"); },
  }, config, () => assert.fail("must not publish"));
  await assert.rejects(service.start(id, token), (error) => error === failure);
  assert.equal(statements.length, 3);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements[2], "ROLLBACK");
  assert.equal(released, true);
  assert.equal(gatewayCalls, 0);
  const lines: string[] = [];
  logRazorpayFailure(failure, (line) => lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]!), {
    stage: "razorpay_schema_check", category: "database", code: "42703", constraint: null,
  });
});
