/** All callers append /api themselves. Empty means the current origin. */
export function apiOrigin(value: string | undefined, production = false): string {
  const configured = value?.trim();
  if (!configured) return production ? "" : "http://localhost:5000";
  if (configured === "/" || configured === "/api" || configured === "/api/") return "";
  let url: URL;
  try { url = new URL(configured); }
  catch { throw new Error("VITE_API_URL must be an HTTP(S) origin, optionally ending in /api."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !['', '/', '/api', '/api/'].includes(url.pathname) ||
      (production && url.protocol !== 'https:')) {
    throw new Error("VITE_API_URL must be a secure API origin without credentials, query or extra path.");
  }
  return url.origin;
}

export const API_URL = apiOrigin(import.meta.env?.VITE_API_URL, import.meta.env?.PROD);
