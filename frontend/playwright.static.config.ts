import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests/static-menu",
  workers: 1,
  reporter: "list",
  outputDir: mkdtempSync(join(tmpdir(), "fr-static-menu-")),
  use: { baseURL: "http://127.0.0.1:5189", browserName: "chromium" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --config vite.static.config.ts --host 127.0.0.1 --port 5189 --strictPort",
    url: "http://127.0.0.1:5189", reuseExistingServer: false,
  },
});
