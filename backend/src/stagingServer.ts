import express from "express";
import helmet from "helmet";
import { gracefulShutdown, registerShutdownSignals } from "./serverLifecycle";

// Deliberately no dotenv, database, application routes, frontend or worker imports.
// This entry point is deployment plumbing only, never an ordering API.
export function createStagingApp(env: NodeJS.ProcessEnv = process.env) {
  if (env.STAGING_HEALTH_ONLY !== "true") {
    throw new Error("Health-only staging requires explicit opt-in.");
  }
  const forbidden = /^(DATABASE_URL|SUPABASE_.+|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGHOST|PGUSER|PGDATABASE|PGPORT|ADMIN_USERNAME|ADMIN_PASSWORD.*|ORDER_TRACKING_SECRET|MERCHANT_UPI_.+|RAZORPAY_KEY.*|RAZORPAY_WEBHOOK.*)$/;
  if (Object.keys(env).some(key => forbidden.test(key) && Boolean(env[key]))) {
    // Never include the key or its value in the error or logs.
    throw new Error("Health-only staging must not receive application credentials or database configuration.");
  }
  if ((env.RAZORPAY_MODE && env.RAZORPAY_MODE !== "off") ||
      (env.DEMO_PAYMENTS_ENABLED && env.DEMO_PAYMENTS_ENABLED !== "false") ||
      (env.SERVE_FRONTEND && env.SERVE_FRONTEND !== "false")) {
    throw new Error("Application and payment features must remain disabled in health-only staging.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
  // Liveness does not imply readiness to accept customer orders.
  app.get("/ready", (_req, res) => { res.status(503).json({ status: "not_ready" }); });
  app.use((_req, res) => { res.status(404).json({ message: "Not found." }); });
  return app;
}

if (require.main === module) {
  try {
    const app = createStagingApp();
    const port = Number(process.env.PORT || "10000");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
    const server = app.listen(port, "0.0.0.0", () => {
      console.log("Health-only staging listener started.");
    });
    const shutdown = gracefulShutdown({
      stopHttp: () => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      }),
      stopWorker: async () => {},
      closePool: async () => {},
      forceClose: () => server.closeAllConnections(),
      fail: () => { process.exitCode = 1; },
      report: () => console.error("Health-only staging shutdown failed."),
    });
    registerShutdownSignals(shutdown);
    server.once("error", () => {
      console.error("Health-only staging listener failed.");
      process.exitCode = 1;
      void shutdown().catch(() => {});
    });
  } catch {
    console.error("Health-only staging startup refused. Check the documented non-secret configuration.");
    process.exitCode = 1;
  }
}
