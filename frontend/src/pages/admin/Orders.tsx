import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
  fetchAdminOrders,
  type AdminOrderRow,
  type AdminOrderStatus,
  type AdminOrderStatusCounts,
} from "../../services/adminApi";

const PAGE_SIZE = 25;
const filters = [
  ["ALL", "All"],
  ["PLACED", "New"],
  ["PREPARING", "Preparing"],
  ["READY", "Ready"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
] as const;

const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

export default function Orders() {
  const [status, setStatus] = useState<"ALL" | AdminOrderStatus>("ALL");
  const [items, setItems] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<AdminOrderStatusCounts | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (
      document.visibilityState === "hidden" ||
      requestInFlightRef.current
    ) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    requestInFlightRef.current = true;
    if (showLoading) setLoading(true);
    try {
      const page = await fetchAdminOrders(
        status,
        PAGE_SIZE,
        offset,
        controller.signal,
      );
      if (requestId !== requestIdRef.current) return;
      setItems(page.items);
      setTotal(page.total);
      setStatusCounts(page.statusCounts);
      setError(null);
      if (offset > 0 && offset >= page.total) {
        setOffset(Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1) * PAGE_SIZE);
      }
    } catch (requestError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load orders.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        controllerRef.current = null;
        requestInFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [offset, status]);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => void refresh(true), 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 2000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      requestInFlightRef.current = false;
    };
  }, [refresh]);

  const setFilter = (nextStatus: "ALL" | AdminOrderStatus) => {
    setStatus(nextStatus);
    setOffset(0);
  };

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b56b36]">
            Order management
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#253b2a]">
            Orders
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#dfe3d8] bg-white px-4 text-sm font-semibold text-[#31573a] disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(([filter, label]) => (
          <button
            key={filter}
            type="button"
            onClick={() => setFilter(filter)}
            aria-pressed={status === filter}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === filter
                ? "bg-[#31573a] text-white"
                : "border border-[#dfe3d8] bg-white text-[#596554] hover:bg-[#f2f4ed]"
            }`}
          >
            {statusCounts ? `${label} (${statusCounts[filter]})` : label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => void refresh(true)} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#e7e4d8] bg-white shadow-sm">
        {loading && items.length === 0 ? (
          <p role="status" className="p-6 text-sm text-[#73796d]">Loading orders...</p>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="font-serif text-xl font-semibold text-[#253b2a]">No orders found</h2>
            <p className="mt-1 text-sm text-[#73796d]">
              {error ? "Orders could not be loaded. Retry to check again." : "There are no orders in this status."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#f8f8f2] text-xs uppercase tracking-wide text-[#73796d]">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Order status</th>
                  <th className="px-4 py-3">Fulfillment</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eeece4]">
                {items.map((order) => (
                  <tr key={order.id} className="hover:bg-[#fdfcf9]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="font-semibold text-[#31573a] hover:underline"
                      >
                        {order.order_number}
                      </Link>
                      {order.payment_source === "DEMO" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          DEMO PAYMENT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#394b38]">{order.customer_name}</td>
                    <td className="px-4 py-3 text-[#73796d]">{order.customer_phone || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{formatPrice(order.total_amount)}</td>
                    <td className="px-4 py-3">{order.payment_status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">{order.order_status}</td>
                    <td className="px-4 py-3">{order.fulfillment_type === "PICKUP" ? "Counter pickup" : "Table"}</td>
                    <td className="px-4 py-3 text-[#73796d]">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eeece4] px-4 py-3 text-sm text-[#73796d]">
          <span>{start}–{end} of {total}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              aria-label="Previous page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
              aria-label="Next page"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
      <p className="text-xs text-[#858a7e]">Orders and status counts refresh automatically every 2 seconds while this page is visible.</p>
    </div>
  );
}
