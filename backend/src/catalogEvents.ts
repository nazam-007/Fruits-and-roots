type Listener = () => void;

const listeners = new Set<Listener>();
const restaurantStatusListeners = new Set<Listener>();

export function subscribeToCatalogChanges(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishCatalogChange() {
  for (const listener of listeners) listener();
}

export function subscribeToRestaurantStatusChanges(listener: Listener) {
  restaurantStatusListeners.add(listener);
  return () => restaurantStatusListeners.delete(listener);
}

export function publishRestaurantStatusChange() {
  for (const listener of restaurantStatusListeners) listener();
}
