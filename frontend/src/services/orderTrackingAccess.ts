import { readDemoTrackingAccess } from "../demo/demoApi";

/** Never use production session credentials to grant access to a browser demo. */
export function readOrderTrackingAccess(orderId: string | undefined): string | null {
  if (!orderId) return null;
  if (import.meta.env.VITE_PREVIEW_MODE === "true") return readDemoTrackingAccess(orderId);
  try { return window.sessionStorage.getItem(`fruits-roots-order-token:${orderId}`); }
  catch { return null; }
}
