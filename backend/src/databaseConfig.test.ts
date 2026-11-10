import assert from "node:assert/strict";
import test from "node:test";
import { Client, type ClientBase } from "pg";
import { buildDatabaseConfig, initializeIntegrationSession } from "./databaseConfig";

const databaseUrl = "postgres://fixture:unused@db.example.invalid:5432/fixture";

test("integration pool sessions apply and verify limits before initialization completes", async () => {
  const statements: string[] = [];
  let complete!: () => void;
  const configured = new Promise<void>((done) => { complete = done; });
  let initialized = false;
  const client = { query: async (sql: string) => {
    statements.push(sql);
    if (sql.includes("set_config")) { await configured; return { rows: [] }; }
    return { rows: [{ statement: "12s", lock: "5s", idle: "10s" }] };
  } } as unknown as ClientBase;
  const config = buildDatabaseConfig({ DATABASE_URL: databaseUrl, INTEGRATION_DATABASE_SAFETY_LIMITS: "enabled" });
  const pending = Promise.resolve(config.onConnect!(client)).then(() => { initialized = true; });
  await Promise.resolve();
  assert.equal(initialized, false);
  assert.equal(statements.length, 1);
  complete(); await pending;
  assert.equal(statements.length, 2);
  assert.ok(statements[1].includes("current_setting"));
  assert.equal(buildDatabaseConfig({ DATABASE_URL: databaseUrl }).onConnect, undefined);
});

test("integration session initialization rejects unchanged pooler defaults and sanitizes failures", async () => {
  for (const fails of [false, true]) {
    const client = { query: async (sql: string) => {
      if (fails) throw new Error("postgres://private:password@fixture token=secret");
      return { rows: sql.includes("current_setting")
        ? [{ statement: "2min", lock: "0", idle: "0" }] : [] };
    } } as unknown as ClientBase;
    await assert.rejects(initializeIntegrationSession(client),
      { message: "Integration session timeout initialization/verification failed" });
  }
});
test("development retains explicit local plaintext configuration", () => {
  assert.equal(buildDatabaseConfig({ DATABASE_URL: databaseUrl }).ssl, false);
});
test("production uses certificate and hostname validating TLS in the actual pg client", () => {
  const config = buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: databaseUrl });
  const client = new Client(config);
  assert.deepEqual(client.ssl, { rejectUnauthorized: true, minVersion: "TLSv1.2" });
});
test("production rejects plaintext and unsupported TLS modes", () => {
  for (const mode of ["disable", "require", "no-verify", "prefer"]) {
    assert.throws(() => buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: databaseUrl, DATABASE_TLS_MODE: mode }));
  }
});
test("URL options cannot replace the verified pg TLS config", () => {
  for (const option of ["sslmode=require", "ssl=false", "sslrootcert=other", "options=unsafe", "host=other", "sslcert=other"]) {
    assert.throws(() => buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: `${databaseUrl}?${option}` }));
  }
});
test("CA file is loaded without logging paths or credentials on failure", () => {
  const env = { DATABASE_URL: databaseUrl, NODE_ENV: "production", DATABASE_CA_CERT_PATH: "fixture-ca" };
  assert.deepEqual(buildDatabaseConfig(env, () => "fixture certificate").ssl,
    { rejectUnauthorized: true, minVersion: "TLSv1.2", ca: "fixture certificate" });
  assert.throws(() => buildDatabaseConfig(env, () => { throw new Error(databaseUrl); }),
    { message: "Unable to read DATABASE_CA_CERT_PATH." });
  assert.throws(() => buildDatabaseConfig(env, () => ""));
});
test("invalid URLs and global verification disablement fail without credential disclosure", () => {
  assert.throws(() => buildDatabaseConfig({ DATABASE_URL: "secret-invalid-url" }),
    { message: "DATABASE_URL must be a valid PostgreSQL URL." });
  assert.throws(() => buildDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: databaseUrl, NODE_TLS_REJECT_UNAUTHORIZED: "0" }));
});
