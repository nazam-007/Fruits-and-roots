import { lazy, Suspense } from "react";
const SelectedApp = lazy(() => import.meta.env.VITE_MENU_PREVIEW === "true"
  ? import("./MenuPreview") : import("./App"));
export default function AppEntry() {
  return <Suspense fallback={<p>Loading...</p>}><SelectedApp /></Suspense>;
}
