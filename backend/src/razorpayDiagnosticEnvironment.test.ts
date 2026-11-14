import assert from "node:assert/strict";
import test from "node:test";
import { installRazorpayDiagnosticEnvironment, loadRazorpayDiagnosticEnvironment } from "./razorpayDiagnosticEnvironment";

const valid = {
  DATABASE_URL: "postgresql://fruits_roots_backend.wznkpgpexjexxzptuuwp:fixture-only@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
  DATABASE_TLS_MODE: "verify-full", NODE_ENV: "development", RAZORPAY_MODE: "test",
  RAZORPAY_KEY_ID: "rzp_test_fixture", RAZORPAY_KEY_SECRET: "fixture-only",
};
function load(patch: Record<string, string | undefined> = {}, inherited: NodeJS.ProcessEnv = {}) {
  const file = Object.entries({ ...valid, ...patch }).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n");
  return loadRazorpayDiagnosticEnvironment(() => file, inherited);
}

test("diagnostic startup selects only file credentials despite inherited database and dotenv settings", () => {
  const env = load({}, { DATABASE_URL: "private", DOTENV_PATH: ".env", RAZORPAY_KEY_ID: "rzp_live_private" });
  assert.equal(env.DATABASE_URL, valid.DATABASE_URL);
  assert.equal(env.RAZORPAY_KEY_ID, valid.RAZORPAY_KEY_ID);
  assert.equal(env.PORT, "5000");
  assert.equal(env.DEMO_PAYMENTS_ENABLED, "false");
});

test("missing diagnostic file or mandatory file field refuses inherited fallback", () => {
  assert.throws(() => loadRazorpayDiagnosticEnvironment(() => { throw Error("private path"); }, valid), /startup refused/);
  for (const key of ["DATABASE_URL", "DATABASE_TLS_MODE", "NODE_ENV", "RAZORPAY_MODE", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
    assert.throws(() => load({ [key]: undefined }, valid), /startup refused/);
  }
});

test("diagnostic startup rejects wrong project, role, endpoint and connection overrides", () => {
  for (const url of [
    valid.DATABASE_URL.replace("wznkpgpexjexxzptuuwp", "mrjsfznxbwjsdzyuzvsi"),
    valid.DATABASE_URL.replace("fruits_roots_backend", "postgres"),
    valid.DATABASE_URL.replace("aws-0-ap-northeast-1", "aws-1-unknown-region"),
    valid.DATABASE_URL.replace(":5432/", ":6543/"), valid.DATABASE_URL.replace("/postgres", "/other"),
    valid.DATABASE_URL.replace(":fixture-only@", "@"),
    valid.DATABASE_URL + "?sslmode=disable", valid.DATABASE_URL + "#private",
  ]) assert.throws(() => load({ DATABASE_URL: url }), /startup refused/);
  assert.doesNotThrow(() => load({ DATABASE_URL: "postgresql://fruits_roots_backend:fixture-only@db.wznkpgpexjexxzptuuwp.supabase.co:5432/postgres" }));
});

test("diagnostic startup rejects production, live credentials, disabled TLS and development Storage", () => {
  for (const patch of [
    { NODE_ENV: "production" }, { RAZORPAY_MODE: "live" }, { RAZORPAY_MODE: "off" },
    { RAZORPAY_KEY_ID: "rzp_live_fixture" }, { DATABASE_TLS_MODE: "disable" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { PORT: "5001" },
    { SUPABASE_URL: "https://mrjsfznxbwjsdzyuzvsi.supabase.co" },
  ]) assert.throws(() => load(patch), /startup refused/);
  assert.throws(() => load({}, { NODE_ENV: "production" }), /startup refused/);
  assert.throws(() => load({}, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }), /startup refused/);
});

test("diagnostic installation clears inherited application settings and pins both dotenv aliases", () => {
  const target: NodeJS.ProcessEnv = { DATABASE_URL: "private", SUPABASE_SERVICE_ROLE_KEY: "private",
    DOTENV_PATH: ".env", DOTENV_CONFIG_OVERRIDE: "true", DOTENV_DEBUG: "true",
    INTEGRATION_ALLOW_WRITES: "private", SHARED_DATABASE_URL: "private", PORT: "9000", PATH: "preserved" };
  const env = load({ DOTENV_PATH: ".env", INTEGRATION_ALLOW_WRITES: "private" });
  installRazorpayDiagnosticEnvironment(target, env, "/fixture/.env.razorpay-testing.local");
  assert.equal(target.DATABASE_URL, valid.DATABASE_URL);
  assert.equal(target.SUPABASE_SERVICE_ROLE_KEY, "");
  assert.equal(target.INTEGRATION_ALLOW_WRITES, undefined);
  assert.equal(target.SHARED_DATABASE_URL, undefined);
  assert.equal(target.DOTENV_PATH, "/fixture/.env.razorpay-testing.local");
  assert.equal(target.DOTENV_CONFIG_PATH, target.DOTENV_PATH);
  assert.equal(target.DOTENV_OVERRIDE, "false");
  assert.equal(target.DOTENV_CONFIG_OVERRIDE, "false");
  assert.equal(target.DOTENV_DEBUG, "false");
  assert.equal(target.PORT, "5000");
  assert.equal(target.PATH, "preserved");
});

test("diagnostic validation errors do not expose credentials or connection strings", () => {
  try { load({ DATABASE_URL: "private-invalid-url" }); assert.fail("must reject"); }
  catch (error) { assert.ok(error instanceof Error); assert.equal(error.message.includes("private-invalid-url"), false); }
});
