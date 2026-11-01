type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToCatalogChanges(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishCatalogChange() {
  for (const listener of listeners) listener();
}
