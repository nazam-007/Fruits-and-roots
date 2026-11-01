export type OrderStatusEvent =
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

type Listener = (status: OrderStatusEvent) => void;

const listenersByOrder = new Map<string, Set<Listener>>();

export function subscribeToOrderStatus(
  orderId: string,
  listener: Listener,
) {
  let listeners = listenersByOrder.get(orderId);
  if (!listeners) {
    listeners = new Set();
    listenersByOrder.set(orderId, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) listenersByOrder.delete(orderId);
  };
}

export function publishOrderStatus(
  orderId: string,
  status: OrderStatusEvent,
) {
  for (const listener of listenersByOrder.get(orderId) ?? []) {
    listener(status);
  }
}
