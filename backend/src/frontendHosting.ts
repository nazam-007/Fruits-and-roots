import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Opt-in full SPA hosting, after API routes, for same-origin admin cookies. */
export function mountFrontend(app: Express, root: string, enabled: string | undefined) {
  if (enabled !== undefined && enabled !== "true" && enabled !== "false") throw new Error("Invalid SERVE_FRONTEND.");
  if (enabled !== "true") {
    app.get("/", (_req, res) => {
      res.json({ message: "Welcome to Fruits & Roots API" });
    });
    return;
  }
  const index = join(root, "index.html");
  if (!existsSync(index)) throw new Error("SERVE_FRONTEND requires the full frontend production build.");
  app.use("/api", (_req, res) => { res.status(404).json({ message: "API endpoint not found." }); });
  app.use("/assets", express.static(join(root, "assets"), { immutable: true, maxAge: "1y" }));
  app.use("/assets", (_req, res) => { res.sendStatus(404); });
  app.use(express.static(root, { index: false, maxAge: 0 }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
}
