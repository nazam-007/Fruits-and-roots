
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./db";
import menuRoutes from "./routes/menu";
import orderRoutes from "./routes/orders";
import adminRoutes from "./routes/admin";
import razorpayRoutes, { razorpayWebhook } from "./routes/razorpay";
import { razorpayConfig } from "./razorpay";
import { getPendingPaymentExpiryMinutes, startPendingPaymentExpiryWorker } from "./paymentExpiry";
import { resolve } from "node:path";
import { frontendOrigins, trustedProxyIps, databaseHealthDiagnostic } from "./deploymentConfig";
import { mountFrontend } from "./frontendHosting";
import { gracefulShutdown, registerShutdownSignals } from "./serverLifecycle";
import { paymentExpiryWorkerEnabled, startVerifiedRuntime, verifyDatabaseReadiness } from "./productionStartup";

razorpayConfig(); // Fail closed for live keys or test mode in production.
const app = express();
let shuttingDown = false;
let starting = require.main === module;
const responses = new Set<express.Response>();
app.use((_req, res, next) => {
  if (shuttingDown || starting) {
    res.setHeader("Connection", "close");
    res.status(503).json({ message: "Service restarting." });
    return;
  }
  responses.add(res);
  const remove = () => responses.delete(res);
  res.once("finish", remove);
  res.once("close", remove);
  next();
});

const PORT = Number(process.env.PORT || 5000);
const origins = frontendOrigins();
const proxies = trustedProxyIps();
if (proxies.length) {
  app.set("trust proxy", proxies);
}

app.use(
  helmet({
    strictTransportSecurity:
      process.env.NODE_ENV === "production" ? undefined : false,
    ...(process.env.SERVE_FRONTEND === "true" ? {
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", "data:", "https:"],
          // Standard Checkout is optional, still subject to the existing test-only gate.
          scriptSrc: ["'self'", ...(process.env.RAZORPAY_MODE === "test" ? ["https://checkout.razorpay.com"] : [])],
          frameSrc: ["'self'", ...(process.env.RAZORPAY_MODE === "test" ? ["https://api.razorpay.com", "https://checkout.razorpay.com"] : [])],
          connectSrc: ["'self'", ...(process.env.RAZORPAY_MODE === "test" ? ["https://api.razorpay.com", "https://checkout.razorpay.com"] : [])],
          upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    } : {}),
  }),
);
app.use(
  cors({
    origin: origins,
    credentials: true,
  })
);

app.post("/api/razorpay/webhook", express.raw({ type: "application/json", limit: "256kb" }), razorpayWebhook);
app.use(express.json({ limit: "6mb" }));
app.use("/api", razorpayRoutes);

// Backend health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Fruits & Roots Backend",
  });
});

// PostgreSQL connection health check
app.get("/api/db-health", async (_req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      status: "connected",
      database: "PostgreSQL",
      message: "Supabase database connected successfully",
    });
  } catch (error) {
    console.error("Database connection failed", databaseHealthDiagnostic(error));

    res.status(500).json({
      status: "disconnected",
      message: "Unable to connect to PostgreSQL",
    });
  }
});

app.use("/api/menu", menuRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", orderRoutes);
mountFrontend(app, resolve(__dirname, "../../frontend/dist"), process.env.SERVE_FRONTEND);

export { app };

async function startApplication() {
  let server: import("node:http").Server | undefined;
  let worker: ReturnType<typeof startPendingPaymentExpiryWorker> | undefined;
  // Install ownership/cleanup before readiness, binding or worker allocation.
  const shutdown = gracefulShutdown({
    stopHttp: () => {
      shuttingDown = true;
      if (!server) return Promise.resolve();
      const closed = new Promise<void>((resolveClose, reject) => {
        server!.close(error => error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error) : resolveClose());
      });
      // SSE clients reconnect after restart; ordinary requests drain normally.
      for (const res of responses) {
        if (String(res.getHeader("Content-Type") || "").startsWith("text/event-stream")) res.end();
      }
      server.closeIdleConnections();
      // Failed startup must not wait for clients holding incomplete requests.
      if (starting) server.closeAllConnections();
      return closed;
    },
    stopWorker: async () => { await worker?.stop(); },
    closePool: () => db.end(),
    forceClose: () => server?.closeAllConnections(),
    fail: () => process.exit(1),
    report: stage => console.error("Server shutdown failed", { stage }),
  });
  registerShutdownSignals(shutdown);
  try {
    const workerEnabled = paymentExpiryWorkerEnabled();
    if (workerEnabled) getPendingPaymentExpiryMinutes();
    await startVerifiedRuntime({
      verify: () => verifyDatabaseReadiness(db),
      listen: () => new Promise<import("node:http").Server>((resolveListen, reject) => {
        if (shuttingDown) { reject(new Error("Startup stopped.")); return; }
        server = app.listen(PORT, () => resolveListen(server!));
        server.once("error", reject);
      }),
      workerEnabled,
      startWorker: async () => {
        if (shuttingDown) throw new Error("Startup stopped.");
        const initialized: ReturnType<typeof startPendingPaymentExpiryWorker> | Promise<ReturnType<typeof startPendingPaymentExpiryWorker>> = startPendingPaymentExpiryWorker();
        // Current factory is synchronous: retain ownership immediately. Also
        // await any future asynchronous initialization rather than losing rejection.
        const activeWorker = initialized instanceof Promise ? await initialized : initialized;
        if (!activeWorker || typeof activeWorker.stop !== "function") throw new Error("Worker initialization failed.");
        worker = activeWorker;
        if (shuttingDown) { await activeWorker.stop(); throw new Error("Startup stopped."); }
      },
      cleanup: shutdown,
    });
    if (shuttingDown) throw new Error("Startup stopped.");
    starting = false;
    console.log(`Fruits & Roots backend running at http://localhost:${PORT}`);
    server!.once("error", () => {
      console.error("HTTP listener failed", { stage: "http_listen" });
      void shutdown().catch(() => {});
    });
  } catch {
    // Also covers invalid configuration before the startup helper is entered.
    await shutdown();
    throw new Error("Backend startup failed.");
  }
}

if (require.main === module) {
  void startApplication().catch(async () => {
    console.error("Backend startup refused; verify restricted database access and startup configuration.");
    process.exitCode = 1;
  });
}
