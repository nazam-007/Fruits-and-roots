import assert from "node:assert/strict";
import test from "node:test";
import { requireDisposableTarget, requireIsolatedTarget } from "./support/integrationTarget";
import { verifySocket, verifyRole, verifyDatabaseHop } from "./support/integrationPreflight";
import { buildDatabaseConfig } from "../src/databaseConfig";
import type { PoolClient } from "pg";
import { classifyDataApiFailure, DataApiProbeError, verifyDataApiDenial } from "./support/integrationDataApi";
const shared = "postgres://owner:unused@db.shared.supabase.co/postgres";

test("Data API error categories expose no arbitrary server messages or credentials", () => {
  for (const [body, expected] of [
    ['{"message":"Invalid API key","hint":"private-fixture"}', "key-rejected"],
    ['{"message":"No API key found in request"}', "key-missing"],
    ['{"code":"42501","message":"private-fixture"}', "database-permission"],
    ['{"code":"PGRST301","message":"private-fixture"}', "jwt-rejected"],
    ['{"message":"private-fixture"}', "unclassified"],
    ["private-fixture", "unclassified"],
  ]) assert.equal(classifyDataApiFailure(body), expected);
});

test("Auth error_code and legacy msg classify rejection without accepting token HTTP 403", async () => {
  const config = { INTEGRATION_SUPABASE_ANON_KEY: "fixture-key", INTEGRATION_AUTHENTICATED_ACCESS_TOKEN: "fixture-token" };
  for (const [body, expected] of [
    [{ code: 403, error_code: "bad_jwt", msg: "private-provider-detail" }, "jwt-rejected"],
    [{ error_code: "session_expired", message: "private-provider-detail" }, "auth-session-rejected"],
    [{ error_code: "session_not_found", msg: "private-provider-detail" }, "auth-session-rejected"],
    [{ error_code: "user_not_found" }, "auth-session-rejected"],
    [{ code: 403, msg: "JWT expired" }, "jwt-rejected"],
    [{ error_code: "unknown_code", msg: "private-provider-detail" }, "unclassified"],
    [{ code: "42501", message: "permission denied" }, "database-permission"],
    [null, "unclassified"],
  ] as const) {
    assert.equal(classifyDataApiFailure(JSON.stringify(body)), expected);
    let requests = 0;
    await assert.rejects(verifyDataApiDenial(config, (async () => {
      requests++;
      return requests === 1 ? new Response(null, { status: 200 })
        : new Response(JSON.stringify(body), { status: 403 });
    }) as typeof fetch), (error: unknown) => {
      assert.ok(error instanceof DataApiProbeError);
      assert.equal(error.probe, "authenticated-token");
      assert.equal(error.status, 403);
      assert.ok(error.message.endsWith(`category=${expected}`));
      assert.ok(!/private-provider-detail|fixture-token/.test(error.message));
      return true;
    });
    assert.equal(requests, 2, "Rejected credentials must stop before session-table probes");
  }
});

test("Data API diagnostics identify the failing probe without leaking credentials or responses", async () => {
  const config = { INTEGRATION_SUPABASE_ANON_KEY: "fixture-key", INTEGRATION_AUTHENTICATED_ACCESS_TOKEN: "fixture-token" };
  const run = (statuses: number[]) => {
    let index = 0;
    return verifyDataApiDenial(config, (async () => new Response("private-response", { status: statuses[index++] })) as typeof fetch);
  };
  assert.deepEqual(await run([200, 200, 401, 403]), { configured: true, anonymousDenied: true, authenticatedDenied: true,
    anonymousStatus: 401, authenticatedStatus: 403,
    denialEvidence: "HTTP rejection; does not distinguish route blocking from SQL permission denial" });
  for (const [statuses, probe, status] of [
    [[401], "client-key", 401], [[200, 401], "authenticated-token", 401],
    [[200, 200, 200], "anonymous-session-denial", 200],
    [[200, 200, 403, 404], "authenticated-session-denial", 404],
  ] as const) {
    await assert.rejects(run([...statuses]), (error: unknown) => {
      assert.ok(error instanceof DataApiProbeError);
      assert.equal(error.probe, probe); assert.equal(error.status, status);
      assert.ok(!/fixture-|private-response/.test(error.message));
      return true;
    });
  }
  await assert.rejects(verifyDataApiDenial(config, (async () => { throw new Error("fixture-token"); }) as typeof fetch),
    (error: unknown) => error instanceof DataApiProbeError && error.status === null && !error.message.includes("fixture-token"));
});

test("Data API credential validation uses Auth endpoints and never requires session exposure", async () => {
  const paths: string[] = [];
  const headers: Headers[] = [];
  await verifyDataApiDenial({ INTEGRATION_SUPABASE_ANON_KEY: "fixture-key", INTEGRATION_AUTHENTICATED_ACCESS_TOKEN: "fixture-token" },
    (async (url, init) => {
      paths.push(new URL(String(url)).pathname);
      headers.push(new Headers(init?.headers));
      return new Response(null, { status: paths.length <= 2 ? 200 : 403 });
    }) as typeof fetch);
  assert.deepEqual(paths, ["/auth/v1/settings", "/auth/v1/user", "/rest/v1/admin_sessions", "/rest/v1/admin_sessions"]);
  assert.equal(headers[0].get("apikey"), "fixture-key");
  assert.equal(headers[2].get("authorization"), null);
  assert.equal(headers[3].get("authorization"), "Bearer fixture-token");
});
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

test("remote integration target is pinned to the approved testing project and restricted login", () => {
  const remote = { ...env,
    INTEGRATION_DATABASE_URL: "postgres://fruits_roots_backend:unused@db.wznkpgpexjexxzptuuwp.supabase.co/postgres",
    INTEGRATION_INSPECTOR_DATABASE_URL: "postgres://postgres:unused@db.wznkpgpexjexxzptuuwp.supabase.co/postgres",
    INTEGRATION_EXPECTED_HOST: "db.wznkpgpexjexxzptuuwp.supabase.co",
    INTEGRATION_EXPECTED_DATABASE: "postgres",
    INTEGRATION_CONNECTION_METHOD: "direct", INTEGRATION_EXPECTED_PROJECT_REF: "wznkpgpexjexxzptuuwp",
  };
  assert.ok(requireDisposableTarget(remote, shared));
  assert.ok(requireIsolatedTarget({ ...remote, INTEGRATION_ALLOW_WRITES: "" }, shared));
  assert.throws(() => requireDisposableTarget({ ...remote, INTEGRATION_ALLOW_WRITES: "" }, shared));
  for (const change of [
    { INTEGRATION_DATABASE_URL: remote.INTEGRATION_DATABASE_URL.replace(".co/postgres", ".co:6543/postgres"),
      INTEGRATION_INSPECTOR_DATABASE_URL: remote.INTEGRATION_INSPECTOR_DATABASE_URL.replace(".co/postgres", ".co:6543/postgres") },
    { INTEGRATION_DATABASE_URL: remote.INTEGRATION_DATABASE_URL.replace("fruits_roots_backend", "postgres") },
    { INTEGRATION_DATABASE_URL: remote.INTEGRATION_DATABASE_URL.replace("wznkpgpexjexxzptuuwp", "otherproject"),
      INTEGRATION_INSPECTOR_DATABASE_URL: remote.INTEGRATION_INSPECTOR_DATABASE_URL.replace("wznkpgpexjexxzptuuwp", "otherproject"),
      INTEGRATION_EXPECTED_HOST: "db.otherproject.supabase.co" },
  ]) assert.throws(() => requireDisposableTarget({ ...remote, ...change }, shared));
  assert.throws(() => requireDisposableTarget(remote, "postgres://owner:unused@unknown.invalid/postgres"));
});

const pooler = {
  ...env, INTEGRATION_CONNECTION_METHOD: "session", INTEGRATION_EXPECTED_PROJECT_REF: "wznkpgpexjexxzptuuwp",
  INTEGRATION_EXPECTED_HOST: "aws-0-ap-northeast-1.pooler.supabase.com", INTEGRATION_EXPECTED_DATABASE: "postgres",
  INTEGRATION_DATABASE_URL: "postgres://fruits_roots_backend.wznkpgpexjexxzptuuwp:unused@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
  INTEGRATION_INSPECTOR_DATABASE_URL: "postgres://postgres.wznkpgpexjexxzptuuwp:unused@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
};

test("session pooler validates both usernames and independent project configuration", () => {
  assert.equal(requireIsolatedTarget(pooler, shared).method, "session");
  // Same shared hostname can route to a DIFFERENT development project.
  assert.ok(requireIsolatedTarget(pooler, pooler.INTEGRATION_DATABASE_URL.replaceAll("wznkpgpexjexxzptuuwp", "development")));
  for (const changes of [
    { INTEGRATION_EXPECTED_PROJECT_REF: "development" }, { INTEGRATION_EXPECTED_PROJECT_REF: "" },
    { INTEGRATION_CONNECTION_METHOD: "direct" },
    { INTEGRATION_DATABASE_URL: pooler.INTEGRATION_DATABASE_URL.replace("fruits_roots_backend", "postgres") },
    { INTEGRATION_DATABASE_URL: pooler.INTEGRATION_DATABASE_URL.replace("wznkpgpexjexxzptuuwp", "development") },
    { INTEGRATION_INSPECTOR_DATABASE_URL: pooler.INTEGRATION_INSPECTOR_DATABASE_URL.replace("wznkpgpexjexxzptuuwp", "development") },
    { INTEGRATION_DATABASE_URL: pooler.INTEGRATION_DATABASE_URL.replace(":unused", "") },
    { INTEGRATION_INSPECTOR_DATABASE_URL: pooler.INTEGRATION_INSPECTOR_DATABASE_URL.replace(":unused", "") },
    { DATABASE_TLS_MODE: "disable" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { INTEGRATION_DATABASE_URL: `${pooler.INTEGRATION_DATABASE_URL}?sslmode=require` },
    { INTEGRATION_DATABASE_URL: `${pooler.INTEGRATION_DATABASE_URL}#fragment` },
  ]) assert.throws(() => requireIsolatedTarget({ ...pooler, ...changes }, shared));
  assert.throws(() => requireIsolatedTarget(pooler, pooler.INTEGRATION_INSPECTOR_DATABASE_URL));
  assert.throws(() => requireIsolatedTarget(pooler, "postgres://postgres.wznkpgpexjexxzptuuwp:unused@db.wznkpgpexjexxzptuuwp.supabase.co/postgres"));
});

test("session pooler rejects unknown endpoints, transaction mode and ambiguous identities", () => {
  for (const [from, to] of [
    ["aws-0-ap-northeast-1.pooler.supabase.com", "aws-1-ap-northeast-1.pooler.supabase.com"],
    ["aws-0-ap-northeast-1.pooler.supabase.com", "aws-0-ap-northeast-1.pooler.supabase.com.evil.invalid"],
    ["aws-0-ap-northeast-1.pooler.supabase.com", "127.0.0.1"],
    [":5432/", ":6543/"], [".wznkpgpexjexxzptuuwp:", ".extra.wznkpgpexjexxzptuuwp:"],
    ["/postgres", "/other"],
  ]) {
    const appUrl = pooler.INTEGRATION_DATABASE_URL.replace(from, to);
    assert.throws(() => requireIsolatedTarget({ ...pooler, INTEGRATION_DATABASE_URL: appUrl,
      INTEGRATION_INSPECTOR_DATABASE_URL: pooler.INTEGRATION_INSPECTOR_DATABASE_URL.replace(from, to),
      INTEGRATION_EXPECTED_HOST: new URL(appUrl).hostname }, shared));
  }
});

test("preflight rejects insecure sockets and elevated runtime roles without a database", () => {
  const socket = (encrypted: boolean, authorized: boolean) => ({ connection: {
    stream: { encrypted, authorized, getProtocol: () => "TLSv1.3" },
  } }) as unknown as PoolClient;
  assert.ok(verifySocket(socket(true, true)));
  assert.throws(() => verifySocket(socket(false, true)));
  assert.throws(() => verifySocket(socket(true, false)));
  const flags = { expected_role: true, rolcanlogin: true, rolinherit: false, rolsuper: false,
    rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false };
  verifyRole(flags);
  for (const key of ["rolsuper","rolbypassrls","rolcreatedb","rolcreaterole","rolinherit","rolreplication"]) {
    assert.throws(() => verifyRole({ ...flags, [key]: true }));
  }
  assert.throws(() => verifyRole({ ...flags, expected_role: false }));
  assert.throws(() => verifyDatabaseHop(false, "direct"));
  assert.equal(verifyDatabaseHop(false, "session").encrypted, false);
  assert.deepEqual(buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: pooler.INTEGRATION_DATABASE_URL }).ssl,
    { rejectUnauthorized: true, minVersion: "TLSv1.2" });
  assert.throws(() => buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: pooler.INTEGRATION_DATABASE_URL,
    DATABASE_TLS_MODE: "disable" }));
});
