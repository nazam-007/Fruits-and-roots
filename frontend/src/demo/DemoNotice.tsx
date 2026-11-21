import { resetDemo } from "./demoApi";
import { Link } from "react-router-dom";

export default function DemoNotice() {
  return <aside aria-label="Demo notice" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
      <div><span className="text-xs font-bold tracking-wide">DEMO MODE</span>
        <p className="font-semibold">Demo mode — no real payments or orders are processed.</p>
        <p className="mt-1 text-xs">Saved approved menu; availability is not live. Use sample details only. Data stays in this browser.</p></div>
      <div className="flex flex-wrap gap-4"><Link to="/admin" className="py-2 font-semibold underline">Demo admin</Link>
        <button className="py-2 underline" type="button" onClick={() => { if (window.confirm("Clear this browser's demo data?")) resetDemo(); }}>Reset demo</button></div>
    </div>
  </aside>;
}
