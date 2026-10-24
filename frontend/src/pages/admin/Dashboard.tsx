import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, Clock3, IndianRupee, PackageCheck, RefreshCw } from "lucide-react";
import { fetchDashboard, type AdminDashboardData } from "../../services/adminApi";

const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

const cards = [
  { key: "total_orders_today", label: "Orders today", icon: Activity },
  { key: "new_orders", label: "New orders", icon: Clock3 },
  { key: "preparing_orders", label: "Preparing", icon: RefreshCw },
  { key: "ready_orders", label: "Ready for pickup", icon: PackageCheck },
  { key: "completed_orders", label: "Completed", icon: CheckCircle2 },
] as const;

export default function Dashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const latest = await fetchDashboard();
      setData(latest);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load dashboard data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => void refresh(), 0);
    const intervalId = window.setInterval(() => void refresh(), 7000);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

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
          Updates every 7 seconds
        </span>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <section
        aria-label="Today's order statistics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {cards.map(({ key, label, icon: Icon }) => (
          <article key={key} className="rounded-2xl border border-[#e7e4d8] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-[#73796d]">
              {label}
              <Icon size={18} className="text-[#658160]" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-[#253b2a]">
              {loading && !data ? "—" : (data?.summary[key] ?? 0)}
            </p>
          </article>
        ))}
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
              Recent orders
            </h2>
            <p className="mt-1 text-xs text-[#73796d]">
              Automatically refreshes while this page is open.
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
        ) : data?.recentOrders.length ? (
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
                {data.recentOrders.map((order) => (
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
            {error ? "Recent orders are temporarily unavailable." : "No orders yet today."}
          </p>
        )}
      </section>
    </div>
  );
}
