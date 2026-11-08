import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseURL = "http://127.0.0.1:5181";
// Every invocation owns its output; nothing is written into Vite's watched root.
const artifacts = mkdtempSync(join(tmpdir(), "fruits-roots-playwright-"));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: join(artifacts, "report"), open: "never" }],
  ],
  outputDir: join(artifacts, "results"),
  webServer: [
    {
      command: "node --import tsx tests/browserServer.ts",
      cwd: "../backend",
      url: "http://127.0.0.1:5191/api/health",
      reuseExistingServer: false,
    },
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181 --strictPort",
      url: baseURL,
      env: { VITE_API_URL: "http://127.0.0.1:5191" },
      reuseExistingServer: false,
    },
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "chromium-mobile-375",
      use: {
        ...devices["iPhone SE"],
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
      },
    },
  ],
});
