import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, IndianRupee, PackageCheck, RefreshCw, XCircle } from "lucide-react";
import {
  fetchAdminOrders,
  fetchDashboard,
  type AdminDashboardData,
  type AdminOrderRow,
} from "../../services/adminApi";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";

const PAGE_SIZE = 25;
const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

const cards = [
  { key: "total_orders", label: "All Orders", icon: ClipboardList },
  { key: "total_orders_today", label: "Orders today", icon: Activity },
  { key: "new_orders", label: "New orders", icon: Clock3 },
  { key: "preparing_orders", label: "Preparing", icon: RefreshCw },
  { key: "ready_orders", label: "Ready for pickup", icon: PackageCheck },
  { key: "completed_orders", label: "Completed", icon: CheckCircle2 },
  { key: "cancelled_orders", label: "Cancelled", icon: XCircle },
] as const;

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function Dashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersOffset, setOrdersOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const [latest, orderPage] = await Promise.all([
        fetchDashboard(signal),
        fetchAdminOrders("ALL", PAGE_SIZE, ordersOffset, signal),
      ]);
      if (signal.aborted) return;
      setData(latest);
      setOrders(orderPage.items);
      setOrdersTotal(orderPage.total);
      setError(null);
      if (ordersOffset > 0 && ordersOffset >= orderPage.total) {
        setOrdersOffset(
          Math.max(0, Math.ceil(orderPage.total / PAGE_SIZE) - 1) * PAGE_SIZE,
        );
      }
    } catch (requestError) {
      if (signal.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load dashboard data.",
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [ordersOffset]);

  const refreshNow = useVisiblePolling(refresh, 2000);
  const start = ordersTotal === 0 ? 0 : ordersOffset + 1;
  const end = Math.min(ordersOffset + orders.length, ordersTotal);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b56b36]">
            Fruits & Roots · Admin
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#253b2a]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#73796d]">
            Today’s pickup service at a glance.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-[#596554] shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#5d8a4c]" />
          Updates every 2 seconds
        </span>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void refreshNow()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <section
        aria-label="Order statistics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map(({ key, label, icon: Icon }) => {
          const status =
            key === "total_orders" || key === "total_orders_today"
              ? "ALL"
              : key === "new_orders"
                ? "PLACED"
                : key === "preparing_orders"
                  ? "PREPARING"
                  : key === "ready_orders"
                    ? "READY"
                    : key === "completed_orders"
                      ? "COMPLETED"
                      : "CANCELLED";
          const searchParams = new URLSearchParams({
            status,
            page: "1",
          });
          if (key === "total_orders_today") {
            searchParams.set("date", getIndiaDate());
          }

          return (
            <Link
              key={key}
              to={`/admin/orders?${searchParams}`}
              aria-label={`${label}: ${data?.summary[key] ?? "orders"}`}
              className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
            >
              <article className="h-full rounded-2xl border border-[#e7e4d8] bg-white p-4 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <div className="flex items-center justify-between text-sm text-[#73796d]">
                  {label}
                  <Icon size={18} className="text-[#658160]" aria-hidden="true" />
                </div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-[#253b2a]">
                  {loading && !data
                    ? "—"
                    : data?.summary[key] ?? (error ? "—" : 0)}
                </p>
              </article>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#c9ddc4] bg-[#f2f7ee] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#31573a]">
            <IndianRupee size={17} aria-hidden="true" />
            Verified revenue today
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[#253b2a]">
            {formatPrice(data?.summary.verified_revenue_today ?? 0)}
          </p>
          <p className="mt-1 text-xs text-[#65715f]">
            Confirmed manual UPI payments only. Demo payments are excluded.
          </p>
        </article>
        <article className="rounded-2xl border border-[#eed8b6] bg-[#fff8ed] p-5">
          <div className="text-sm font-semibold text-[#73542f]">
            Demo payments · not business revenue
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[#73542f]">
            {formatPrice(data?.summary.demo_revenue_today ?? 0)}
          </p>
          <p className="mt-1 text-xs text-[#8b704c]">
            Development demonstration totals shown separately.
          </p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e7e4d8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#eeece4] px-5 py-4">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#253b2a]">
              All orders
            </h2>
            <p className="mt-1 text-xs text-[#73796d]">
              All orders, with automatic updates while this page is visible.
            </p>
          </div>
          <Link
            to="/admin/orders"
            className="text-sm font-semibold text-[#31573a] hover:underline"
          >
            View all
          </Link>
        </div>
        {loading && !data ? (
          <p role="status" className="p-6 text-sm text-[#73796d]">
            Loading recent orders...
          </p>
        ) : orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-[#f8f8f2] text-xs uppercase tracking-wide text-[#73796d]">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eeece4]">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#fdfcf9]">
                    <td className="px-5 py-3">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="font-semibold text-[#31573a] hover:underline"
                      >
                        {order.order_number}
                      </Link>
                      {order.payment_source === "DEMO" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          DEMO
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[#394b38]">{order.customer_name}</td>
                    <td className="px-5 py-3 tabular-nums">{formatPrice(order.total_amount)}</td>
                    <td className="px-5 py-3">{order.payment_status.replaceAll("_", " ")}</td>
                    <td className="px-5 py-3">{order.order_status}</td>
                    <td className="px-5 py-3 text-[#73796d]">
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-sm text-[#73796d]">
            {error ? "Recent orders are temporarily unavailable." : "No orders yet."}
          </p>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eeece4] px-4 py-3 text-sm text-[#73796d]">
          <span>{start}–{end} of {ordersTotal}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrdersOffset(Math.max(0, ordersOffset - PAGE_SIZE))}
              disabled={ordersOffset === 0 || loading}
              aria-label="Previous orders page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOrdersOffset(ordersOffset + PAGE_SIZE)}
              disabled={ordersOffset + PAGE_SIZE >= ordersTotal || loading}
              aria-label="Next orders page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
