export const TEST_PROJECT = "wznkpgpexjexxzptuuwp";
export const SESSION_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
export type ConnectionMethod = "direct" | "session" | "local";
export function fixtureNumber(runId: string) {
  return `T${runId.replaceAll("-", "").slice(0, 19)}`;
}

function identity(value: string) {
  const url = new URL(value);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
    ? /^[a-z_][a-z0-9_]*\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1] : undefined;
  return { url, project: direct || pooler,
    endpoint: `${url.hostname}:${url.port || "5432"}${url.pathname}` };
}

export function requireIsolatedTarget(env: NodeJS.ProcessEnv, sharedUrl: string) {
  if (!env.INTEGRATION_DATABASE_URL || !env.INTEGRATION_INSPECTOR_DATABASE_URL ||
      !env.INTEGRATION_RUN_ID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.INTEGRATION_RUN_ID)) {
    throw new Error("Disposable integration opt-in and complete isolated configuration are required.");
  }
  try {
    const target = identity(env.INTEGRATION_DATABASE_URL);
    const inspector = identity(env.INTEGRATION_INSPECTOR_DATABASE_URL);
    const shared = identity(sharedUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.url.hostname);
    const session = target.url.hostname === SESSION_HOST;
    const method: ConnectionMethod = local ? "local" : session ? "session" : "direct";
    if (!local && (
      env.INTEGRATION_EXPECTED_PROJECT_REF !== TEST_PROJECT ||
      env.INTEGRATION_CONNECTION_METHOD !== method ||
      target.project !== TEST_PROJECT || inspector.project !== TEST_PROJECT || !shared.project ||
      !target.url.password || !inspector.url.password ||
      (env.DATABASE_TLS_MODE && env.DATABASE_TLS_MODE !== "verify-full") ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      decodeURIComponent(target.url.username) !== (session ? `fruits_roots_backend.${TEST_PROJECT}` : "fruits_roots_backend") ||
      decodeURIComponent(inspector.url.username) !== (session ? `postgres.${TEST_PROJECT}` : "postgres")
    )) throw new Error();
    if (target.url.hostname !== env.INTEGRATION_EXPECTED_HOST ||
        target.url.pathname !== `/${env.INTEGRATION_EXPECTED_DATABASE}` ||
        inspector.endpoint !== target.endpoint ||
        (local && target.endpoint === shared.endpoint) ||
        (target.project && target.project === shared.project) ||
        target.url.search || inspector.url.search || target.url.hash || inspector.url.hash ||
        (local ? !target.url.pathname.startsWith("/fruits_roots_test_")
          : (!session && target.url.hostname !== `db.${TEST_PROJECT}.supabase.co`) ||
            (target.url.port || "5432") !== "5432" || target.url.pathname !== "/postgres") ||
        !["postgres:", "postgresql:"].includes(target.url.protocol) ||
        !["postgres:", "postgresql:"].includes(inspector.url.protocol)) {
      throw new Error();
    }
    return { applicationUrl: env.INTEGRATION_DATABASE_URL, inspectorUrl: env.INTEGRATION_INSPECTOR_DATABASE_URL, method };
  } catch {
    throw new Error("Integration target is not an approved disposable endpoint distinct from the shared database.");
  }
}

export function requireDisposableTarget(env: NodeJS.ProcessEnv, sharedUrl: string) {
  if (env.INTEGRATION_ALLOW_WRITES !== "I_ACKNOWLEDGE_DISPOSABLE_ONLY") {
    throw new Error("Disposable integration write opt-in is required.");
  }
  return requireIsolatedTarget(env, sharedUrl);
}
