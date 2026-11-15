import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Separate entry/build: never imports App, service clients or local .env files.
export default defineConfig({
  root: "static-menu",
  envDir: false,
  envPrefix: [],
  publicDir: false,
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist-static", emptyOutDir: true, sourcemap: false },
});
