import { lazy, Suspense } from "react";
// Both normal and browser-demo builds use the original customer/admin App.
const SelectedApp = lazy(() => import.meta.env.VITE_PREVIEW_MODE !== "true" && import.meta.env.VITE_MENU_PREVIEW === "true"
  ? import("./MenuPreview") : import("./App"));
export default function AppEntry() {
  return <Suspense fallback={<p>Loading...</p>}><SelectedApp /></Suspense>;
}
