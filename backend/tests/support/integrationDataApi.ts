type Probe = "client-key" | "authenticated-token" | "anonymous-session-denial" | "authenticated-session-denial";
type FailureCategory = "key-rejected" | "key-missing" | "database-permission" | "jwt-rejected" | "auth-session-rejected" | "unclassified";

export function classifyDataApiFailure(body: string): FailureCategory {
  try {
    const value = JSON.parse(body) as { message?: unknown; msg?: unknown; code?: unknown; error_code?: unknown };
    // Auth/GoTrue errors are not PostgREST errors. Recognize only documented
    // machine codes; classification never makes a failed /auth/v1/user valid.
    if (value.error_code === "bad_jwt") return "jwt-rejected";
    if (["session_expired", "session_not_found", "user_not_found"].includes(String(value.error_code))) {
      return "auth-session-rejected";
    }
    const message = typeof value.message === "string" ? value.message : typeof value.msg === "string" ? value.msg : "";
    if (/invalid api key/i.test(message)) return "key-rejected";
    if (/no api key|api key.*missing/i.test(message)) return "key-missing";
    if (value.code === "42501" || /permission denied/i.test(message)) return "database-permission";
    if (/^PGRST30[0-9]$/.test(String(value.code)) || /jwt.*(?:expired|invalid)|invalid.*jwt/i.test(message)) return "jwt-rejected";
  } catch { /* Never echo arbitrary or non-JSON provider content. */ }
  return "unclassified";
}

export class DataApiProbeError extends Error {
  constructor(readonly probe: Probe, readonly status: number | null, category: FailureCategory = "unclassified") {
    super(`Data API ${probe}: ${status === null ? "network/TLS/timeout failure" : `HTTP ${status}; category=${category}`}`);
  }
}

// Valid credentials are checked first so an invalid key cannot masquerade as a
// successful session-table authorization test. GET requests only; no row data.
export async function verifyDataApiDenial(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  const key = env.INTEGRATION_SUPABASE_ANON_KEY;
  const token = env.INTEGRATION_AUTHENTICATED_ACCESS_TOKEN;
  if (!key || !token) return { configured: false, anonymousDenied: false, authenticatedDenied: false };
  const base = "https://wznkpgpexjexxzptuuwp.supabase.co";
  const check = async (probe: Probe, path: string, allowed: number[], bearer?: string) => {
    let status: number;
    let category: FailureCategory = "unclassified";
    try {
      const response = await fetcher(base + path, {
        headers: { apikey: key, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        signal: AbortSignal.timeout(10000), redirect: "error",
      });
      status = response.status;
      if (!allowed.includes(status)) {
        category = classifyDataApiFailure(await response.text());
      } else await response.body?.cancel();
    } catch { throw new DataApiProbeError(probe, null); }
    if (!allowed.includes(status)) throw new DataApiProbeError(probe, status, category);
    return status;
  };
  // OpenAPI at the REST root is not a reliable key-validity contract. Validate
  // the key at Auth settings, then validate a real user token independently.
  await check("client-key", "/auth/v1/settings", [200]);
  await check("authenticated-token", "/auth/v1/user", [200], token);
  const statuses: number[] = [];
  for (const bearer of [undefined, token]) {
    statuses.push(await check(bearer ? "authenticated-session-denial" : "anonymous-session-denial",
      "/rest/v1/admin_sessions?select=token_hash&limit=0", [401, 403], bearer));
  }
  return { configured: true, anonymousDenied: true, authenticatedDenied: true,
    anonymousStatus: statuses[0], authenticatedStatus: statuses[1],
    denialEvidence: "HTTP rejection; does not distinguish route blocking from SQL permission denial" };
}
