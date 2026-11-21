import { demoFetch } from "../demo/demoApi";
export const appFetch: typeof fetch = import.meta.env.VITE_PREVIEW_MODE === "true" ? demoFetch : globalThis.fetch.bind(globalThis);
