import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./staticMenu.css";
import StaticMenu from "./StaticMenu";

createRoot(document.getElementById("root")!).render(<StrictMode><StaticMenu /></StrictMode>);
