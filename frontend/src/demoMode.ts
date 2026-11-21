export const IS_DEMO = import.meta.env.VITE_PREVIEW_MODE === "true";
export function browserStorageKey(key: string) { return IS_DEMO ? `fr-demo:${key}` : key; }
