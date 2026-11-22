import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Pool } from "pg";
import { cancelWithRefund, lockOrderPayment, manualRefundSchema, recordManualRefund, refundProjection } from "./refunds";

const id = "00000000-0000-4000-8000-000000000341";
const hash = createHash("sha256").update("refund-test-tracking-token").digest("hex");
const requestedAt = "2026-01-01T12:00:00.000Z", completedAt = "2026-01-01T12:01:00.000Z";
const input = { reference: "RETURN-341", amountPaise: 12000, completedAt,
  evidenceNote: "Return independently matched in bank records.", moneyReturnedConfirmed: true as const };

test("migration 017 source guards prerequisites, exact refund fields and NULL-safe check", () => {
  const sql = readFileSync("migrations/017_cancellation_refund_tracking.sql", "utf8").replace(/--[^\n]*/g, "");
  const fields = [...sql.matchAll(/ADD COLUMN (refund_\w+)/g)].map(match => match[1]);
  assert.deepEqual(fields, ["refund_status", "refund_due_paise", "refund_requested_at", "refund_reference",
    "refund_amount_paise", "refund_completed_at", "refund_recorded_at", "refund_recorded_by", "refund_evidence_note"]);
  const service = readFileSync("src/refunds.ts", "utf8");
  for (const field of fields) assert.ok(service.includes(field), `Backend must use ${field}`);
  const preflight = sql.slice(0, sql.indexOf("ALTER TABLE"));
  for (const column of ["verified_at", "verified_by", "reconciliation_required", ...fields]) assert.ok(preflight.includes(`'${column}'`));
  assert.match(preflight, /RAISE EXCEPTION[\s\S]*already or partially applied/);
  assert.match(sql, /\) IS TRUE\);/);
  assert.match(sql, /^\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /lock_timeout = '5s'/);
  assert.match(sql, /statement_timeout = '30s'/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|INSERT)\b/);
});

function fixture() {
  let state = { id, total_amount: 120, tracking_token_hash: hash, order_status: "PLACED", payment_status: "PAID",
    payment: { payment_status: "PAID", payment_source: "MANUAL_UPI", verified_at: requestedAt, verified_by: "admin-fixture",
      verified_transaction_reference: "PAID-341", razorpay_payment_id: "pay_fixture", reconciliation_required: false,
      refund_status: "NONE" as string | null, refund_due_paise: null as number | null, refund_requested_at: null as string | null,
      refund_reference: null as string | null, refund_amount_paise: null as number | null, refund_completed_at: null as string | null,
      refund_evidence_note: null as string | null, refund_recorded_by: null as string | null } };
  let queue = Promise.resolve();
  const sqls: string[] = [];
  let failCancellation = false, writes = 0;
  const db = { connect: async () => {
    let working = structuredClone(state), unlock: (() => void) | undefined;
    return { query: async (sql: string, args: unknown[] = []) => {
      sqls.push(sql);
      if (sql === "BEGIN") return { rows: [] };
      if (sql === "COMMIT") { state = working; unlock?.(); unlock = undefined; return { rows: [] }; }
      if (sql === "ROLLBACK") { unlock?.(); unlock = undefined; return { rows: [] }; }
      assert.equal(args[0], id);
      if (sql.includes("FROM orders WHERE id=$1 FOR UPDATE")) {
        const previous = queue; queue = new Promise<void>(resolve => { unlock = resolve; });
        await previous; working = structuredClone(state);
        return { rows: [{ ...working, payment: undefined }] };
      }
      if (sql.includes("FROM payments p")) { assert.ok(unlock, "Order lock must precede payment lock"); assert.ok(sql.includes("FOR UPDATE")); return { rows: [working.payment] }; }
      writes++;
      if (sql.includes("refund_status='PENDING'" ) && sql.startsWith("UPDATE payments SET refund_status='PENDING'")) {
        working.payment.refund_status = "PENDING"; working.payment.refund_due_paise = Number(args[1]); working.payment.refund_requested_at = requestedAt;
      } else if (sql.startsWith("UPDATE orders SET order_status='CANCELLED'")) {
        if (failCancellation) throw Error("synthetic transaction failure");
        assert.equal(working.order_status, "PLACED"); working.order_status = "CANCELLED";
      } else if (sql.startsWith("UPDATE payments SET refund_status='COMPLETED'")) {
        Object.assign(working.payment, { refund_status: "COMPLETED", refund_reference: args[1], refund_amount_paise: args[2],
          refund_completed_at: args[3], refund_recorded_by: args[4], refund_evidence_note: args[5] });
      } else if (sql === "UPDATE orders SET order_status='PREPARING' WHERE id=$1") working.order_status = "PREPARING";
      else throw Error("Unexpected fixture query");
      return { rows: [{ id }], rowCount: 1 };
    }, release: () => { unlock?.(); } };
  } } as unknown as Pool;
  return { db, state: () => structuredClone(state), set: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; },
    payment: (patch: Partial<typeof state.payment>) => Object.assign(state.payment, patch), sqls,
    fail: () => { failCancellation = true; }, writes: () => writes };
}

test("placed paid cancellation atomically creates pending full refund; duplicate is idempotent", async () => {
  const f = fixture();
  const result = await cancelWithRefund(f.db, id, hash);
  assert.equal(result.refundReviewRequired, true); assert.equal(f.state().order_status, "CANCELLED");
  assert.equal(f.state().payment.refund_due_paise, 12000); assert.equal(f.state().payment_status, "PAID");
  assert.equal(f.state().payment.refund_status, "PENDING");
  const writes = f.writes(); assert.equal((await cancelWithRefund(f.db, id, hash)).changed, false); assert.equal(f.writes(), writes);
});

test("all post-placed statuses and invalid tracking access reject cancellation", async () => {
  for (const status of ["PREPARING", "READY", "COMPLETED", "PENDING_PAYMENT"]) {
    const f = fixture(); f.set({ order_status: status });
    await assert.rejects(cancelWithRefund(f.db, id, hash), { status: 409 }); assert.equal(f.writes(), 0);
  }
  const f = fixture(); await assert.rejects(cancelWithRefund(f.db, id, "x".repeat(64)), { status: 404 }); assert.equal(f.writes(), 0);
});

test("unpaid, rejected, cancelled and expired payments create no refund obligation", async () => {
  for (const status of ["PENDING_PAYMENT", "PENDING_VERIFICATION", "REJECTED", "CANCELLED", "EXPIRED"]) {
    const f = fixture(); f.set({ payment_status: status }); f.payment({ payment_status: status });
    assert.equal((await cancelWithRefund(f.db, id, hash)).refundReviewRequired, false);
    assert.equal(f.state().payment.refund_status, "NONE"); assert.equal(f.state().payment.refund_due_paise, null);
  }
});

test("Razorpay test captures track simulated refunds; DEMO never creates financial obligation", async () => {
  const f = fixture(); f.payment({ payment_source: "RAZORPAY_TEST" });
  assert.equal((await cancelWithRefund(f.db, id, hash)).refundReviewRequired, true);
  const demo = fixture(); demo.payment({ payment_source: "DEMO" });
  assert.equal((await cancelWithRefund(demo.db, id, hash)).refundReviewRequired, false);
});

test("inconsistent payment evidence and missing migration fail closed without cancellation", async () => {
  for (const patch of [{ verified_transaction_reference: "" }, { reconciliation_required: true }, { refund_status: null }]) {
    const f = fixture(); f.payment(patch); await assert.rejects(cancelWithRefund(f.db, id, hash));
    assert.equal(f.state().order_status, "PLACED"); assert.equal(f.writes(), 0);
  }
});

test("failure after pending-refund write rolls both states back", async () => {
  const f = fixture(); f.fail(); await assert.rejects(cancelWithRefund(f.db, id, hash));
  assert.equal(f.state().order_status, "PLACED"); assert.equal(f.state().payment.refund_status, "NONE");
  assert.ok(f.sqls.includes("ROLLBACK"));
});

test("concurrent duplicate cancellations create one refund only", async () => {
  const f = fixture(); const results = await Promise.all([cancelWithRefund(f.db, id, hash), cancelWithRefund(f.db, id, hash)]);
  assert.equal(results.filter(r => r.changed).length, 1); assert.equal(f.writes(), 2);
});

test("cancellation and preparation use shared order-first lock; exactly one wins in either order", async () => {
  for (const cancelFirst of [true, false]) {
    const f = fixture();
    const prepare = async () => {
      const client = await f.db.connect();
      try { await client.query("BEGIN"); const order = await lockOrderPayment(client, id);
        if (order?.order_status !== "PLACED") throw Error("status conflict");
        await client.query("UPDATE orders SET order_status='PREPARING' WHERE id=$1", [id]); await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    };
    const results = await Promise.allSettled(cancelFirst ? [cancelWithRefund(f.db, id, hash), prepare()] : [prepare(), cancelWithRefund(f.db, id, hash)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(f.state().order_status, cancelFirst ? "CANCELLED" : "PREPARING");
    assert.equal(f.state().payment.refund_status, cancelFirst ? "PENDING" : "NONE");
  }
  const admin = readFileSync("src/routes/admin.ts", "utf8");
  assert.ok(admin.includes("const locked = await lockOrderPayment(client, orderId.data)"));
});

test("manual refund needs full returned amount, past timestamp and explicit evidence", async () => {
  assert.equal(manualRefundSchema.safeParse({ ...input, moneyReturnedConfirmed: false }).success, false);
  assert.equal(manualRefundSchema.safeParse({ ...input, evidenceNote: "" }).success, false);
  const f = fixture(); await cancelWithRefund(f.db, id, hash);
  await assert.rejects(recordManualRefund(f.db, id, "admin", { ...input, amountPaise: 1 }));
  await assert.rejects(recordManualRefund(f.db, id, "admin", { ...input, completedAt: "2025-01-01T00:00:00Z" }));
  await assert.rejects(recordManualRefund(f.db, id, "admin", input, Date.parse(requestedAt)));
  await assert.rejects(recordManualRefund(f.db, id, "", input));
  assert.equal(f.state().payment.refund_status, "PENDING");
  const results = await Promise.all([recordManualRefund(f.db, id, "admin", input), recordManualRefund(f.db, id, "admin", input)]);
  assert.equal(results.filter(r => r.duplicate).length, 1);
  assert.equal(f.state().payment.refund_status, "COMPLETED"); assert.equal(f.state().payment.refund_recorded_by, "admin");
  await assert.rejects(recordManualRefund(f.db, id, "admin", { ...input, reference: "DIFFERENT" }), { status: 409 });
});

test("no pending refund cannot be completed and customer projection excludes admin evidence", async () => {
  const f = fixture(); await assert.rejects(recordManualRefund(f.db, id, "admin", input));
  assert.ok(!refundProjection("p").includes("refund_reference"));
  assert.ok(!refundProjection("p").includes("evidence_note"));
  assert.ok(refundProjection("p", true).includes("evidence_note"));
});


test("counter cancellation requires no refund when unpaid and preserves full evidence when paid", async () => {
  const unpaid = fixture(); unpaid.set({ payment_status: "UNPAID" }); unpaid.payment({ payment_source: "PAY_AT_COUNTER", payment_status: "UNPAID" });
  const cancelled = await cancelWithRefund(unpaid.db, id, hash);
  assert.equal(cancelled.refundReviewRequired, false);
  assert.equal(unpaid.state().payment.refund_status, "NONE");
  const paid = fixture(); paid.payment({ payment_source: "PAY_AT_COUNTER", verified_transaction_reference: `COUNTER-${id}` });
  assert.equal((await cancelWithRefund(paid.db, id, hash)).refundReviewRequired, true);
});
