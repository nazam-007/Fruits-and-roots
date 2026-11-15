import { isIP } from "node:net";

export function frontendOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins = (env.FRONTEND_ORIGIN || (env.NODE_ENV === "production" ? "" : "http://localhost:5173"))
    .split(",").map(value => value.trim()).filter(Boolean);
  if (!origins.length) throw new Error("FRONTEND_ORIGIN must be configured in production.");
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error("Invalid FRONTEND_ORIGIN."); }
    if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) ||
        (env.NODE_ENV === "production" && parsed.protocol !== "https:")) {
      throw new Error("FRONTEND_ORIGIN must contain exact HTTP(S) origins; production requires HTTPS.");
    }
  }
  return origins;
}

export function trustedProxyIps(env: NodeJS.ProcessEnv = process.env): string[] {
  const addresses = (env.TRUSTED_PROXY_IPS || "").split(",").map(value => value.trim()).filter(Boolean);
  for (const address of addresses) {
    const [ip, prefix, extra] = address.split("/");
    const version = isIP(ip!);
    if (!version || extra !== undefined || (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error("TRUSTED_PROXY_IPS requires explicit IPs/CIDRs, never wildcard trust or hop counts.");
    }
  }
  return addresses;
}

export function adminCookieSecurity(env: NodeJS.ProcessEnv = process.env): string[] {
  return ["HttpOnly", "SameSite=Strict", ...(env.NODE_ENV === "production" ? ["Secure"] : [])];
}

export function databaseHealthDiagnostic(error: unknown) {
  let code: unknown;
  try { code = (error as { code?: unknown } | null)?.code; } catch { /* Untrusted error property. */ }
  const allowed = ["08000", "08001", "08003", "08006", "28P01", "42501", "53300", "57014", "57P01",
    "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_TLS_CERT_ALTNAME_INVALID"];
  return { stage: "database_health", category: "database", code: typeof code === "string" && allowed.includes(code) ? code : "unknown" };
}
