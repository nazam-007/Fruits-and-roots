function identity(value: string) {
  const url = new URL(value);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  const pooler = url.hostname.endsWith(".pooler.supabase.com")
    ? decodeURIComponent(url.username).split(".").at(-1) : undefined;
  return { url, project: direct || pooler,
    endpoint: `${url.hostname}:${url.port || "5432"}${url.pathname}` };
}

export function requireDisposableTarget(env: NodeJS.ProcessEnv, sharedUrl: string) {
  if (env.INTEGRATION_ALLOW_WRITES !== "I_ACKNOWLEDGE_DISPOSABLE_ONLY" ||
      !env.INTEGRATION_DATABASE_URL || !env.INTEGRATION_INSPECTOR_DATABASE_URL ||
      !env.INTEGRATION_RUN_ID || !/^[0-9a-f-]{36}$/i.test(env.INTEGRATION_RUN_ID)) {
    throw new Error("Disposable integration opt-in and complete isolated configuration are required.");
  }
  try {
    const target = identity(env.INTEGRATION_DATABASE_URL);
    const inspector = identity(env.INTEGRATION_INSPECTOR_DATABASE_URL);
    const shared = identity(sharedUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.url.hostname);
    if (target.url.hostname !== env.INTEGRATION_EXPECTED_HOST ||
        target.url.pathname !== `/${env.INTEGRATION_EXPECTED_DATABASE}` ||
        inspector.endpoint !== target.endpoint ||
        target.endpoint === shared.endpoint ||
        (target.project && target.project === shared.project) ||
        target.url.search || inspector.url.search ||
        (local ? !target.url.pathname.startsWith("/fruits_roots_test_")
          : !/^db\.[a-z0-9]+\.supabase\.co$/.test(target.url.hostname))) {
      throw new Error();
    }
    return { applicationUrl: env.INTEGRATION_DATABASE_URL, inspectorUrl: env.INTEGRATION_INSPECTOR_DATABASE_URL };
  } catch {
    throw new Error("Integration target is not an approved disposable endpoint distinct from the shared database.");
  }
}
