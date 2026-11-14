import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDatabaseConfig } from "./databaseConfig";
import { installRazorpayDiagnosticEnvironment, loadRazorpayDiagnosticEnvironment,
  RAZORPAY_TEST_ENV_FILE, RAZORPAY_TEST_PROJECT } from "./razorpayDiagnosticEnvironment";

async function main() {
  const file = resolve(__dirname, "..", RAZORPAY_TEST_ENV_FILE);
  const selected = loadRazorpayDiagnosticEnvironment(() => readFileSync(file, "utf8"), process.env);
  buildDatabaseConfig(selected); // Validate certificate loading without opening a connection.
  installRazorpayDiagnosticEnvironment(process.env, selected, file);
  // Imported server.ts is not the entry point, so its expiry-worker startup is not run.
  const { app } = await import("./server.js");
  const server = app.listen(5000, () => {
    console.log(JSON.stringify({ startup: "razorpay_diagnostic", project: RAZORPAY_TEST_PROJECT,
      role: "fruits_roots_backend", tlsMode: "verify-full", razorpayMode: "test", expiryWorker: false, port: 5000 }));
  });
  server.on("error", () => {
    console.error("Razorpay diagnostic listener failed; check whether port 5000 is occupied.");
    process.exitCode = 1;
  });
}

void main().catch(() => {
  console.error("Razorpay diagnostic startup refused; inspect isolated configuration privately.");
  process.exitCode = 1;
});
