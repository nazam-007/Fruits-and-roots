
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./db";
import menuRoutes from "./routes/menu";
import orderRoutes from "./routes/orders";
import adminRoutes from "./routes/admin";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const configuredFrontendOrigins = process.env.FRONTEND_ORIGIN
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === "production" && !configuredFrontendOrigins?.length) {
  throw new Error("FRONTEND_ORIGIN must be configured in production.");
}
const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
for (const origin of frontendOrigins) {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("FRONTEND_ORIGIN must contain valid origin URLs.");
  }
  if (
    parsedOrigin.origin !== origin ||
    (process.env.NODE_ENV === "production" && parsedOrigin.protocol !== "https:")
  ) {
    throw new Error(
      "FRONTEND_ORIGIN must contain exact origins and use HTTPS in production.",
    );
  }
}

const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);
if (trustedProxyIps.length) {
  app.set("trust proxy", trustedProxyIps);
}

app.use(
  helmet({
    strictTransportSecurity:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(
  cors({
    origin: frontendOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "6mb" }));

// Home route
app.get("/", (_req, res) => {
  res.json({
    message: "Welcome to Fruits & Roots API",
  });
});

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
    console.error("Database connection failed:", error);

    res.status(500).json({
      status: "disconnected",
      message: "Unable to connect to PostgreSQL",
    });
  }
});

app.use("/api/menu", menuRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", orderRoutes);

export { app };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fruits & Roots backend running at http://localhost:${PORT}`);
  });
}
