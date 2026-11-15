import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Normal dev/build always loads the full app, even with a stale preview flag.
  // The database-backed preview requires an explicit, separate Vite mode.
  define: {
    "import.meta.env.VITE_MENU_PREVIEW": JSON.stringify(mode === "menu-preview" ? "true" : "false"),
  },
}));
