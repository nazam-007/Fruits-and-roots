import assert from "node:assert/strict";
import test from "node:test";
import { requireDisposableTarget } from "./support/integrationTarget";
const shared = "postgres://owner:unused@db.shared.supabase.co/postgres";
const env = {
  INTEGRATION_ALLOW_WRITES: "I_ACKNOWLEDGE_DISPOSABLE_ONLY",
  INTEGRATION_DATABASE_URL: "postgres://app:unused@127.0.0.1/fruits_roots_test_fixture",
  INTEGRATION_INSPECTOR_DATABASE_URL: "postgres://owner:unused@127.0.0.1/fruits_roots_test_fixture",
  INTEGRATION_EXPECTED_HOST: "127.0.0.1", INTEGRATION_EXPECTED_DATABASE: "fruits_roots_test_fixture",
  INTEGRATION_RUN_ID: "00000000-0000-4000-8000-000000000001",
};
test("integration guard accepts only an explicitly identified disposable target", () => {
  assert.equal(requireDisposableTarget(env, shared).applicationUrl, env.INTEGRATION_DATABASE_URL);
  assert.throws(() => requireDisposableTarget({}, shared));
  assert.throws(() => requireDisposableTarget({ ...env, INTEGRATION_ALLOW_WRITES: "true" }, shared));
});
test("integration guard refuses shared targets including pooler/direct aliases", () => {
  assert.throws(() => requireDisposableTarget(env, env.INTEGRATION_DATABASE_URL));
  assert.throws(() => requireDisposableTarget({ ...env,
    INTEGRATION_DATABASE_URL: shared, INTEGRATION_INSPECTOR_DATABASE_URL: shared,
    INTEGRATION_EXPECTED_HOST: "db.shared.supabase.co", INTEGRATION_EXPECTED_DATABASE: "postgres",
  }, "postgres://postgres.shared:unused@region.pooler.supabase.com:5432/postgres"));
});
test("integration guard rejects unmarked names, inspectors on another database and URL options", () => {
  for (const change of [
    { INTEGRATION_EXPECTED_HOST: "different.invalid" },
    { INTEGRATION_DATABASE_URL: "postgres://app:unused@127.0.0.1/postgres", INTEGRATION_EXPECTED_DATABASE: "postgres" },
    { INTEGRATION_INSPECTOR_DATABASE_URL: shared },
    { INTEGRATION_DATABASE_URL: `${env.INTEGRATION_DATABASE_URL}?sslmode=disable` },
  ]) assert.throws(() => requireDisposableTarget({ ...env, ...change }, shared));
});
