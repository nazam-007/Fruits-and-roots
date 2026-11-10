import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse } from "dotenv";
import { Pool } from "pg";
import { buildDatabaseConfig } from "../src/databaseConfig";
import { requireIsolatedTarget, requireDisposableTarget } from "./support/integrationTarget";
import { integrationPreflight } from "./support/integrationPreflight";
import { DataApiProbeError, verifyDataApiDenial } from "./support/integrationDataApi";
import { requireWriteApproval, WriteApprovalError, inspectorConfig, closeResources, reportFailures, dataApiDiagnostics } from "./support/integrationSafety";

let stage = "local configuration";

async function main() {
  const mode = process.argv[2];
  if (!["preflight", "run"].includes(mode)) throw new Error();
  let file: Record<string, string>;
  try { file = parse(readFileSync(resolve(__dirname, "../.env.integration.local"))); }
  catch { console.error("Missing backend/.env.integration.local; copy the integration example and configure privately."); process.exitCode = 1; return; }
  // Do not inherit a shell DATABASE_URL or let dotenv import development secrets.
  const env: NodeJS.ProcessEnv = { ...file, NODE_ENV: "production", DATABASE_TLS_MODE: "verify-full", INTEGRATION_DATABASE_SAFETY_LIMITS: "enabled" };
  if (file.DATABASE_TLS_MODE && file.DATABASE_TLS_MODE !== "verify-full") throw new Error();
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error();
  let shared = file.SHARED_DATABASE_URL;
  try { shared = parse(readFileSync(resolve(__dirname, "../.env"))).DATABASE_URL || shared; } catch { /* explicit exclusion required */ }
  if (!shared) throw new Error();
  stage = "project/endpoint validation";
  const target = requireIsolatedTarget(env, shared);
  if (target.method === "local") throw new Error();
  if (mode === "run") {
    stage = "write approval validation";
    requireWriteApproval(env);
    requireDisposableTarget(env, shared);
    // Remove inherited application/database/integration variables before spawning.
    for (const key of Object.keys(process.env)) {
      if (/^(DATABASE_|INTEGRATION_|SHARED_DATABASE_|ADMIN_|SUPABASE_|ORDER_TRACKING_|MERCHANT_|DEMO_PAYMENTS_|DOTENV_|PENDING_PAYMENT_)/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, env, { SHARED_DATABASE_URL: shared,
      DOTENV_CONFIG_PATH: resolve(__dirname, "../.env.integration.local") });
    const { integrationSuite } = await import("./database.integration.test.js");
    await test("disposable database security and restaurant integration", { timeout: 180_000 }, integrationSuite);
    return;
  }
  stage = "database TLS configuration";
  const application = new Pool(buildDatabaseConfig({ ...env, DATABASE_URL: target.applicationUrl }));
  const inspector = new Pool(inspectorConfig(env, target.inspectorUrl));
  const primary: unknown[] = [];
  const cleanup: unknown[] = [];
  try {
    stage = "database connection/role/permissions/isolation/empty-target checks";
    const result = await integrationPreflight(application, inspector, env.INTEGRATION_RUN_ID!, target.method, env.INTEGRATION_TABLE_FIXTURE_ID,
      (check) => { stage = `preflight / ${check}`; });
    stage = "Data API checks";
    const dataApi = await verifyDataApiDenial(env);
    console.log(JSON.stringify({ project: "wznkpgpexjexxzptuuwp", connectionMethod: target.method, sharedProjectDifferent: true,
      ...result, dataApi }, null, 2));
  } catch (error) { primary.push(error); }
  finally {
    try { await closeResources([["application probe", () => application.end()], ["inspector", () => inspector.end()]]); }
    catch (error) { cleanup.push(error); }
  }
  reportFailures(primary, cleanup);
}

void main().catch((error: unknown) => {
  // Provider errors can include connection credentials. Never serialize them.
  console.error(`Integration preflight/launch refused at ${stage}.`);
  if (error instanceof WriteApprovalError) console.error(error.message);
  for (const diagnostic of dataApiDiagnostics(error)) console.error(diagnostic);
  process.exitCode = 1;
});
