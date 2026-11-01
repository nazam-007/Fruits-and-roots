import { useEffect } from "react";
import { streamOrderStatus, type OrderStatus } from "../services/ordersApi";

const FALLBACK_INTERVAL_MS = 2000;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15_000;

export function useOrderStatusUpdates(
  orderId: string | undefined,
  trackingToken: string | null,
  orderStatus: OrderStatus | undefined,
  refreshStatus: () => Promise<void>,
) {
  useEffect(() => {
    if (
      !orderId ||
      !trackingToken ||
      !orderStatus ||
      orderStatus === "COMPLETED" ||
      orderStatus === "CANCELLED"
    ) {
      return;
    }

    let active = true;
    let connecting = false;
    let intervalId: number | undefined;
    let reconnectId: number | undefined;
    let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    let streamController: AbortController | null = null;

    const stopPolling = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const startPolling = () => {
      if (!active || document.hidden || intervalId !== undefined) return;
      void refreshStatus();
      intervalId = window.setInterval(
        () => void refreshStatus(),
        FALLBACK_INTERVAL_MS,
      );
    };

    const clearReconnect = () => {
      if (reconnectId !== undefined) {
        window.clearTimeout(reconnectId);
        reconnectId = undefined;
      }
    };

    const connect = async () => {
      if (!active || document.hidden || connecting) return;
      connecting = true;
      const controller = new AbortController();
      streamController = controller;
      try {
        await streamOrderStatus(
          orderId,
          trackingToken,
          controller.signal,
          () => void refreshStatus(),
          () => {
            reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
            stopPolling();
          },
        );
      } catch {
        // Polling remains active while the stream is unavailable.
      } finally {
        connecting = false;
        if (streamController === controller) streamController = null;
        if (active && !document.hidden) {
          startPolling();
          reconnectId = window.setTimeout(() => {
            reconnectId = undefined;
            void connect();
          }, reconnectDelayMs);
          reconnectDelayMs = Math.min(
            reconnectDelayMs * 2,
            MAX_RECONNECT_DELAY_MS,
          );
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        clearReconnect();
        streamController?.abort();
      } else {
        startPolling();
        clearReconnect();
        void connect();
      }
    };

    startPolling();
    void connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      stopPolling();
      clearReconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      streamController?.abort();
    };
  }, [orderId, orderStatus, refreshStatus, trackingToken]);
}
