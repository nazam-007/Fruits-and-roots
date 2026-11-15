
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

razorpayConfig(); // Fail closed for live keys or test mode in production.
const app = express();
let shuttingDown = false;
const responses = new Set<express.Response>();
app.use((_req, res, next) => {
  if (shuttingDown) {
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

if (require.main === module) {
  getPendingPaymentExpiryMinutes();
  let worker: ReturnType<typeof startPendingPaymentExpiryWorker> | undefined;
  const server = app.listen(PORT, () => {
    if (shuttingDown) return;
    // A failed/duplicate listener must not start a second database-writing worker.
    worker = startPendingPaymentExpiryWorker();
    console.log(`Fruits & Roots backend running at http://localhost:${PORT}`);
  });
  const shutdown = gracefulShutdown({
    stopHttp: () => {
      shuttingDown = true;
      const closed = new Promise<void>((resolveClose, reject) => {
        server.close(error => error ? reject(error) : resolveClose());
      });
      // SSE clients reconnect after restart; ordinary requests drain normally.
      for (const res of responses) {
        if (String(res.getHeader("Content-Type") || "").startsWith("text/event-stream")) res.end();
      }
      server.closeIdleConnections();
      return closed;
    },
    stopWorker: async () => { await worker?.stop(); },
    closePool: () => db.end(),
    forceClose: () => server.closeAllConnections(),
    fail: () => process.exit(1),
    report: stage => console.error("Server shutdown failed", { stage }),
  });
  registerShutdownSignals(shutdown);
  server.once("error", () => {
    console.error("HTTP listener failed", { stage: "http_listen" });
    void shutdown().catch(() => {});
  });
}
