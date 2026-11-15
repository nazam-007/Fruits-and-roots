import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const artifacts=mkdtempSync(join(tmpdir(),"fr-menu-preview-"));
export default defineConfig({testDir:"./tests/preview",workers:1,reporter:"list",outputDir:artifacts,
 use:{baseURL:"http://127.0.0.1:5187",browserName:"chromium"},
 webServer:{command:"node node_modules/vite/bin/vite.js --mode menu-preview --host 127.0.0.1 --port 5187 --strictPort",url:"http://127.0.0.1:5187",reuseExistingServer:false,
 env:{VITE_MENU_PREVIEW:"true",VITE_API_URL:"http://preview-api.invalid"}}});
