export function expiryWorker(run: () => Promise<unknown>, report: () => void, intervalMs = 60_000) {
  let stopped = false;
  let pending: Promise<void> | undefined;
  const tick = () => {
    if (stopped || pending) return;
    pending = Promise.resolve().then(run).then(() => {}, report).finally(() => { pending = undefined; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { stop: async () => { stopped = true; clearInterval(timer); await pending; } };
}

export function gracefulShutdown(options: {
  stopHttp: () => Promise<void>; stopWorker: () => Promise<void>; closePool: () => Promise<void>;
  forceClose: () => void; fail: () => void; report: (stage: string) => void; deadlineMs?: number;
}) {
  let pending: Promise<void> | undefined;
  return () => pending ??= new Promise<void>((resolve, reject) => {
    let finished = false;
    const failure = (stage: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.report(stage);
      options.forceClose();
      options.fail();
      reject(new Error("Server shutdown incomplete."));
    };
    const timer = setTimeout(() => failure("shutdown_deadline"), options.deadlineMs ?? 25_000);
    void (async () => {
      const drained = await Promise.allSettled([
        Promise.resolve().then(options.stopHttp), Promise.resolve().then(options.stopWorker),
      ]);
      if (finished) return;
      if (drained.some(result => result.status === "rejected")) { failure("shutdown_drain"); return; }
      // Never end the application pool while the worker or HTTP work is still draining.
      try { await options.closePool(); } catch { failure("shutdown_pool"); return; }
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    })();
  });
}

export function registerShutdownSignals(shutdown: () => Promise<void>, signals: {
  on: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
  removeListener: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
} = process) {
  const handle = () => { void shutdown().catch(() => {}); };
  // Keep both handlers installed during drainage; every signal shares shutdown().
  signals.on("SIGTERM", handle);
  signals.on("SIGINT", handle);
  return () => {
    signals.removeListener("SIGTERM", handle);
    signals.removeListener("SIGINT", handle);
  };
}
