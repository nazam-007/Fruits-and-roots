
import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "./db";
import menuRoutes from "./routes/menu";
import orderRoutes from "./routes/orders";
import adminRoutes from "./routes/admin";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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

app.listen(PORT, () => {
  console.log(
    `Fruits & Roots backend running at http://localhost:${PORT}`
  );
});
