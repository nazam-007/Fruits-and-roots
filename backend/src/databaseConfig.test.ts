import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { buildDatabaseConfig } from "./databaseConfig";

const databaseUrl = "postgres://fixture:unused@db.example.invalid:5432/fixture";
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
