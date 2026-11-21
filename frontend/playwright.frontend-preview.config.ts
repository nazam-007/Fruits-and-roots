import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests/frontend-preview",
  workers: 1,
  reporter: "list",
  outputDir: mkdtempSync(join(tmpdir(), "fr-frontend-preview-")),
  use: { baseURL: "http://127.0.0.1:5191", browserName: "chromium" },
  webServer: {
    command: "npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5191 --strictPort",
    env: { VITE_PREVIEW_MODE: "true", VITE_MENU_PREVIEW: "true", VITE_API_URL: "https://preview-api-must-not-load.invalid", VITE_TEST_SECRET: "preview-secret-must-not-be-bundled" },
    url: "http://127.0.0.1:5191",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
