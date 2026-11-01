import { useEffect, useRef } from "react";

type PollCallback = (signal: AbortSignal) => Promise<void>;

export function useVisiblePolling(
  callback: PollCallback,
  intervalMs: number,
  refreshKey?: string | number,
) {
  const callbackRef = useRef(callback);
  const runRef = useRef<() => void>(() => {});
  const activeRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    activeRef.current = true;
    let intervalId: number | undefined;

    const run = async () => {
      if (!activeRef.current || document.hidden) return;
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }

      inFlightRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        await callbackRef.current(controller.signal);
      } finally {
        inFlightRef.current = false;
        if (controllerRef.current === controller) controllerRef.current = null;
        if (pendingRef.current && activeRef.current && !document.hidden) {
          pendingRef.current = false;
          void runRef.current();
        }
      }
    };
    runRef.current = () => void run();

    const stopInterval = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const startInterval = () => {
      stopInterval();
      if (document.hidden) return;
      void run();
      intervalId = window.setInterval(() => void run(), intervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
        controllerRef.current?.abort();
      } else {
        startInterval();
      }
    };

    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      activeRef.current = false;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controllerRef.current?.abort();
    };
  }, [intervalMs, refreshKey]);

  return () => runRef.current();
}
