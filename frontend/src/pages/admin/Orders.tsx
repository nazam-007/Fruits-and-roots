import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
  fetchAdminOrders,
  type AdminOrderRow,
  type AdminOrderStatus,
} from "../../services/adminApi";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";

const PAGE_SIZE = 15;
const filters = [
  ["ALL", "All"],
  ["PLACED", "New"],
  ["PREPARING", "Preparing"],
  ["READY", "Ready"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
] as const;
const orderStatuses = ["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;

function isOrderStatus(value: string | null): value is (typeof orderStatuses)[number] {
  return value !== null && orderStatuses.includes(value as (typeof orderStatuses)[number]);
}

const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

function isValidDateFilter(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const status: "ALL" | AdminOrderStatus = isOrderStatus(urlStatus)
    ? urlStatus
    : "PLACED";
  const pageParam = searchParams.get("page");
  const dateParam = searchParams.get("date");
  const dateFilter = isValidDateFilter(dateParam) ? dateParam : undefined;
  const parsedPage = pageParam === null ? 1 : Number(pageParam);
  const pageNumber =
    Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [items, setItems] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<"ALL" | AdminOrderStatus, number>>({
    ALL: 0,
    PLACED: 0,
    PREPARING: 0,
    READY: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const offset = (pageNumber - 1) * PAGE_SIZE;
      const result = await fetchAdminOrders(
        status,
        PAGE_SIZE,
        offset,
        signal,
        pageNumber,
        dateFilter,
      );
      if (signal.aborted) return;
      setItems(result.items);
      setTotal(result.total);
      setCounts(result.counts);
      setError(null);
      if (pageNumber > result.totalPages) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("page", String(result.totalPages));
        setSearchParams(nextParams, { replace: true });
      }
    } catch (requestError) {
      if (signal.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load orders.",
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [dateFilter, pageNumber, searchParams, setSearchParams, status]);

  const refreshNow = useVisiblePolling(
    refresh,
    2000,
    `${status}:${pageNumber}:${dateFilter ?? ""}`,
  );

  const setFilter = (nextStatus: "ALL" | AdminOrderStatus) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("status", nextStatus);
    nextParams.set("page", "1");
    setSearchParams(nextParams);
    setLoading(true);
  };

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);
    setLoading(true);
  };

  useEffect(() => {
    const validPageParam =
      pageParam === null ||
      (Number.isInteger(Number(pageParam)) && Number(pageParam) > 0);
    if (!isOrderStatus(urlStatus) || !validPageParam) {
      const nextParams = new URLSearchParams(searchParams);
      if (!isOrderStatus(urlStatus)) nextParams.set("status", "PLACED");
      if (!validPageParam) nextParams.set("page", "1");
      if (dateParam !== null && !isValidDateFilter(dateParam)) {
        nextParams.delete("date");
      }
      setSearchParams(nextParams, { replace: true });
    }
  }, [dateParam, pageParam, searchParams, setSearchParams, urlStatus]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (pageNumber - 1) * PAGE_SIZE + 1;
  const end = Math.min(pageNumber * PAGE_SIZE, total);

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
          onClick={() => {
            setLoading(true);
            void refreshNow();
          }}
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
            {label} <span className="ml-1 text-xs opacity-75">{counts[filter]}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => {
            setLoading(true);
            void refreshNow();
          }} className="font-semibold underline">
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
              {error
                ? "Orders could not be loaded. Retry to check again."
                : status === "PLACED"
                  ? "No new orders right now."
                  : "There are no orders in this status."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="admin-orders-table" className="w-full min-w-[900px] text-left text-sm">
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
          <div>
            <p>Showing {start}–{end} of {total} orders</p>
            <p className="mt-1 text-xs">Page {pageNumber} of {totalPages}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1 || loading}
              aria-label="Previous page"
              aria-controls="admin-orders-table"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage(pageNumber + 1)}
              disabled={pageNumber >= totalPages || loading}
              aria-label="Next page"
              aria-controls="admin-orders-table"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe3d8] disabled:opacity-40"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
      <p className="text-xs text-[#858a7e]">Orders and status counts refresh automatically every 2 seconds.</p>
    </div>
  );
}
