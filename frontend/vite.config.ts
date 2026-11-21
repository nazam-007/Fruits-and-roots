import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const flag = loadEnv(mode, process.cwd(), "VITE_").VITE_PREVIEW_MODE;
  if (flag !== undefined && flag !== "true" && flag !== "false") {
    throw new Error("VITE_PREVIEW_MODE must be true or false.");
  }
  const preview = flag === "true";
  return {
  plugins: [react(), tailwindcss(), {
    name: "frontend-only-preview",
    transformIndexHtml(html) {
      if (!preview) return html;
      return {
        html: html.replace("Fresh juices, fruit bowls, choco waffles and toasties at Fruits & Roots. Explore the menu and order from your table.", "Fruits & Roots sample menu preview. Ordering coming soon."),
        tags: [{ tag: "meta", attrs: {
          "http-equiv": "Content-Security-Policy",
          content: "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'self'",
        }, injectTo: "head-prepend" }],
      };
    },
  }],
  // Preview builds expose only the preview flag, never operational configuration.
  envPrefix: preview ? ["VITE_PREVIEW_MODE"] : "VITE_",
  // The older database-backed preview still requires its explicit Vite mode.
  // Frontend-only preview is selected separately and takes precedence at entry.
  define: {
    "import.meta.env.VITE_PREVIEW_MODE": JSON.stringify(preview ? "true" : "false"),
    "import.meta.env.VITE_MENU_PREVIEW": JSON.stringify(mode === "menu-preview" ? "true" : "false"),
  },
  };
});
