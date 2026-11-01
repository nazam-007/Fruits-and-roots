import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import MenuItemImage from "../../components/customer/MenuItemImage";
import { useMenu } from "../../context/MenuContext";
import type { MenuItem } from "../../data/menu";
import {
  cancelOrder,
  fetchOrder,
  OrderApiError,
  type OrderDetails,
  type OrderStatus,
  type PaymentStatus,
} from "../../services/ordersApi";
import { useOrderStatusUpdates } from "../../hooks/useOrderStatusUpdates";

const orderStatusLabels: Record<OrderStatus, string> = {
  PLACED: "Order Placed",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING_PAYMENT: "Payment Pending",
  PENDING_VERIFICATION: "Payment Pending Verification",
  PAID: "Paid",
  REJECTED: "Payment Rejected",
};

const orderProgress: OrderStatus[] = [
  "PLACED",
  "PREPARING",
  "READY",
  "COMPLETED",
];
const formatPrice = (price: number) => `₹${price.toLocaleString("en-IN")}`;
function getOrderType(order: OrderDetails): "TAKEAWAY" | "DINE_IN" {
  return (
    order.orderType ??
    (order.fulfillmentType === "TABLE" ? "DINE_IN" : "TAKEAWAY")
  );
}

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const { menuItems, loading: menuLoading, error: menuError } = useMenu();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRequestRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const refreshStatusRef = useRef<() => Promise<void>>(async () => {});

  const getTrackingToken = useCallback(() => {
    if (!orderId) return null;
    try {
      return window.sessionStorage.getItem(
        `fruits-roots-order-token:${orderId}`,
      );
    } catch {
      return null;
    }
  }, [orderId]);

  const refreshStatus = useCallback(async (showInitialLoading = false) => {
    if (!orderId) {
      if (mountedRef.current) {
        setError("Order not found.");
        setLoading(false);
      }
      return;
    }

    const token = getTrackingToken();
    if (!token) {
      if (mountedRef.current) {
        setError(
          "This order's secure tracking access is not available in this browser tab.",
        );
        setLoading(false);
      }
      return;
    }

    if (requestInFlightRef.current) {
      pendingRefreshRef.current = true;
      return;
    }

    requestInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (showInitialLoading && mountedRef.current) setLoading(true);
    try {
      const latestOrder = await fetchOrder(orderId, token);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setOrder(latestOrder);
        setError(null);
      }
    } catch (fetchError) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to refresh order status.",
        );
      }
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
      if (pendingRefreshRef.current && mountedRef.current) {
        pendingRefreshRef.current = false;
        void refreshStatusRef.current();
      }
    }
  }, [getTrackingToken, orderId]);

  useEffect(() => {
    refreshStatusRef.current = () => refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    mountedRef.current = true;
    const timeoutId = window.setTimeout(() => void refreshStatus(true), 0);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearTimeout(timeoutId);
    };
  }, [refreshStatus]);

  const trackingToken = getTrackingToken();
  useOrderStatusUpdates(
    orderId,
    trackingToken,
    order?.orderStatus,
    refreshStatus,
  );

  const cancelCustomerOrder = async () => {
    if (!order || order.orderStatus !== "PLACED" || cancelRequestRef.current) {
      return;
    }
    if (!window.confirm("Cancel this order? This action cannot be undone.")) {
      return;
    }

    const token = getTrackingToken();
    if (!token || !orderId) {
      setError("Secure tracking access is unavailable. This order cannot be cancelled from this browser.");
      return;
    }

    cancelRequestRef.current = true;
    setCanceling(true);
    setError(null);
    setNotice(null);
    try {
      const result = await cancelOrder(orderId, token);
      await refreshStatus();
      setNotice(
        result.refundReviewRequired
          ? "Your order was cancelled. A verified UPI payment may need refund review; no refund was issued automatically."
          : "Your order was cancelled successfully.",
      );
    } catch (cancelError) {
      if (cancelError instanceof OrderApiError && cancelError.status === 409) {
        await refreshStatus();
        setNotice(
          cancelError.message ||
            "This order can no longer be cancelled. The latest status has been refreshed.",
        );
      } else {
        setError(
          cancelError instanceof Error
            ? cancelError.message
            : "Unable to cancel this order.",
        );
      }
    } finally {
      cancelRequestRef.current = false;
      setCanceling(false);
    }
  };

  if (!order && loading) {
    return (
      <div role="status" className="py-20 text-center text-[#73796d]">
        Loading your order...
      </div>
    );
  }

  if (!order) {
    return (
      <section className="mx-auto max-w-xl rounded-[2rem] border border-[#e7e4d8] bg-white px-6 py-12 text-center shadow-sm sm:px-10">
        <p role="alert" className="text-[#984734]">
          {error ?? "Unable to load this order."}
        </p>
        <button
          type="button"
          onClick={() => void refreshStatus(true)}
          disabled={loading}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#31573a] px-5 font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  const currentStep = orderProgress.indexOf(order.orderStatus);
  const isCancelled = order.orderStatus === "CANCELLED";
  const isPaid = order.paymentStatus === "PAID";
  const orderType = getOrderType(order);
  const createdAt = new Date(order.createdAt);
  const orderedProductIds = new Set(order.items.map((item) => item.productId));
  const orderedCategories = new Set(
    order.items
      .map((orderItem) =>
        menuItems.find((menuItem) => menuItem.id === orderItem.productId)?.category,
      )
      .filter((category): category is string => Boolean(category)),
  );
  const availableProductIds = new Set<string>();
  const availableProducts = menuItems.filter((item) => {
    if (
      !item.available ||
      item.variants.length === 0 ||
      availableProductIds.has(item.id)
    ) {
      return false;
    }

    availableProductIds.add(item.id);
    return true;
  });
  const notAlreadyOrdered = availableProducts.filter(
    (item) => !orderedProductIds.has(item.id),
  );
  const complementaryProducts = notAlreadyOrdered.filter(
    (item) => !orderedCategories.has(item.category),
  );
  const sameCategoryProducts = notAlreadyOrdered.filter((item) =>
    orderedCategories.has(item.category),
  );
  const recommendations: MenuItem[] = [
    ...complementaryProducts,
    ...sameCategoryProducts,
  ].slice(0, 4);
  if (recommendations.length < 2) {
    const recommendedIds = new Set(recommendations.map((item) => item.id));
    for (const item of availableProducts) {
      if (!recommendedIds.has(item.id)) {
        recommendations.push(item);
        recommendedIds.add(item.id);
      }
      if (recommendations.length === 2) break;
    }
  }

  return (
    <div className="mx-auto max-w-4xl pb-24 sm:pb-8">
      <Link
        to="/menu"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-semibold text-[#596554] transition hover:text-[#31573a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e2d6] bg-white">
          <ArrowLeft size={17} aria-hidden="true" />
        </span>
        Back to menu
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
            Order tracking
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
            Your order is in
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dfe3d8] bg-white px-4 text-sm font-semibold text-[#31573a] transition hover:bg-[#f2f4ed] disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? "animate-spin" : ""}
          />
          Refresh status
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#edc8bd] bg-[#fff2ee] px-4 py-3 text-sm text-[#984734]"
        >
          {error} Your last successfully loaded order details remain visible.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 break-words rounded-xl border border-[#c9ddc4] bg-[#f2f7ee] px-4 py-3 text-sm text-[#31573a]"
        >
          {notice}
        </p>
      )}

      <section
        aria-labelledby="payment-status-heading"
        className={`mb-6 rounded-3xl border p-5 sm:p-6 ${
          isPaid
            ? "border-[#c9ddc4] bg-[#f2f7ee]"
            : "border-[#eed8b6] bg-[#fff8ed]"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#31573a]">
            {isPaid ? (
              <ShieldCheck size={20} aria-hidden="true" />
            ) : (
              <Clock3 size={20} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2
              id="payment-status-heading"
              className="font-semibold text-[#253b2a]"
            >
              {order.paymentSource === "DEMO" && order.paymentStatus === "PAID"
                ? "Demo Paid"
                : paymentStatusLabels[order.paymentStatus]}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#6d7468]">
              {order.paymentSource === "DEMO" &&
              order.paymentStatus === "PAID" ? (
                <>
                  Your demo order has been placed successfully! The merchant
                  {orderType === "TAKEAWAY"
                    ? " will announce your name when the order is ready for pickup."
                    : " will prepare your order for you to enjoy at the café."}
                </>
              ) : order.orderStatus === "READY"
                ? orderType === "TAKEAWAY"
                  ? "Your order is ready! Please collect it from the counter."
                  : "Your order is ready to enjoy at the café."
                : orderType === "TAKEAWAY"
                  ? order.paymentStatus === "PENDING_PAYMENT"
                    ? "Your order is awaiting payment. Restaurant staff will confirm the payment status."
                    : order.paymentStatus === "PENDING_VERIFICATION"
                      ? "Your order has been received. Restaurant staff will verify your payment and prepare your items. We will call your name when it is ready for pickup."
                      : order.paymentStatus === "PAID"
                        ? "Your payment has been verified. We will call your name when your order is ready for pickup."
                        : "Restaurant staff could not verify your payment. Please speak with them before collecting your order."
                  : order.paymentStatus === "PENDING_VERIFICATION"
                    ? "We have received your order and UPI transaction reference. Restaurant staff will verify your payment."
                    : order.paymentStatus === "PAID"
                      ? "Restaurant staff have verified your payment."
                      : order.paymentStatus === "PENDING_PAYMENT"
                        ? "Your order is awaiting payment. Restaurant staff will confirm the payment status."
                        : "Restaurant staff could not verify this payment. Please speak with them."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b56b36]">
                Preparation status
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#253b2a]">
                {order.orderStatus === "READY" && orderType === "DINE_IN"
                  ? "Ready to enjoy"
                  : orderStatusLabels[order.orderStatus]}
              </h2>
            </div>
            {orderType === "TAKEAWAY" ? (
              <span className="rounded-full bg-[#edf1e6] px-3 py-1 text-xs font-semibold text-[#31573a]">
                Takeaway
              </span>
            ) : (
              <span className="rounded-full bg-[#edf1e6] px-3 py-1 text-xs font-semibold text-[#31573a]">
                {order.tableNumber ? `Dine-in · Table ${order.tableNumber}` : "Dine-in"}
              </span>
            )}
          </div>

          <ol className="space-y-4">
            {orderProgress.map((status, index) => {
              const complete = !isCancelled && currentStep >= index;
              const active = !isCancelled && currentStep === index;
              return (
                <li key={status} className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      complete
                        ? "bg-[#31573a] text-white"
                        : "bg-[#f1f0e9] text-[#858a7e]"
                    }`}
                  >
                    {complete ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <span className="text-xs font-semibold">{index + 1}</span>
                    )}
                  </span>
                  <span
                    className={`text-sm ${
                      active
                        ? "font-semibold text-[#253b2a]"
                        : complete
                          ? "text-[#596554]"
                          : "text-[#858a7e]"
                    }`}
                  >
                    {status === "READY" && orderType === "DINE_IN"
                      ? "Ready to enjoy"
                      : orderStatusLabels[status]}
                  </span>
                </li>
              );
            })}
            {isCancelled && (
              <li className="font-semibold text-[#984734]">Order Cancelled</li>
            )}
          </ol>
          {order.orderStatus === "PLACED" && (
            <div className="mt-6 border-t border-[#eeece4] pt-5">
              <button
                type="button"
                onClick={() => void cancelCustomerOrder()}
                disabled={canceling || loading}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#edc8bd] px-5 text-sm font-semibold text-[#984734] transition hover:bg-[#fff2ee] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {canceling ? "Cancelling..." : "Cancel order"}
              </button>
              <p className="mt-2 text-xs leading-5 text-[#73796d]">
                Cancellation is available only before preparation begins.
              </p>
            </div>
          )}
        </section>

        <aside className="min-w-0 rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-[#253b2a]">
            Order details
          </h2>
          <dl className="mt-4 space-y-2 border-b border-[#eeece4] pb-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#73796d]">Order number</dt>
              <dd className="max-w-[60%] break-all text-right font-medium text-[#253b2a]">
                {order.orderNumber}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#73796d]">Name</dt>
              <dd className="min-w-0 break-all text-right font-medium text-[#253b2a]">
                {order.customerName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#73796d]">Order type</dt>
              <dd className="font-medium text-[#253b2a]">
                {orderType === "TAKEAWAY"
                  ? "Takeaway"
                  : order.tableNumber
                    ? `Dine-in · Table ${order.tableNumber}`
                    : "Dine-in"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#73796d]">Placed</dt>
              <dd className="text-right font-medium text-[#253b2a]">
                {Number.isNaN(createdAt.getTime())
                  ? "—"
                  : createdAt.toLocaleString()}
              </dd>
            </div>
          </dl>

          <ul className="space-y-3 py-4">
            {order.items.map((item, index) => (
              <li
                key={`${item.productName}-${item.size}-${index}`}
                className="flex justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-all font-medium text-[#394b38]">
                    {item.productName}
                  </p>
                  <p className="text-xs text-[#7a8074]">
                    {item.size} · Qty {item.quantity} ·{" "}
                    {formatPrice(item.unitPrice)} each
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-[#394b38]">
                  {formatPrice(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex justify-between border-t border-[#eeece4] pt-4 font-semibold text-[#253b2a]">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(order.totalAmount)}</span>
          </div>
        </aside>
      </div>

      {!isCancelled && (
        <section
          aria-labelledby="recommendations-heading"
          className="mt-8 rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="recommendations-heading"
                className="font-serif text-2xl font-semibold text-[#253b2a]"
              >
                Craving Something More? 🥤
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#73796d]">
                Make your wait a little tastier. Explore something delicious!
              </p>
            </div>
            <Link
              to="/menu"
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[#dfe3d8] px-4 text-sm font-semibold text-[#31573a] transition hover:bg-[#f2f4ed]"
            >
              Explore menu
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {order.orderStatus === "COMPLETED" ? (
            <p className="mt-4 text-sm text-[#596554]">
              Ready for another fresh favorite? Explore the menu to start a separate order.
            </p>
          ) : menuLoading && menuItems.length === 0 ? (
            <p role="status" className="mt-4 text-sm text-[#73796d]">
              Loading menu suggestions...
            </p>
          ) : menuError && menuItems.length === 0 ? (
            <p role="alert" className="mt-4 text-sm text-[#73796d]">
              Suggestions are temporarily unavailable. You can still explore the menu.
            </p>
          ) : recommendations.length === 0 ? (
            <p className="mt-4 text-sm text-[#73796d]">
              No available suggestions right now. Explore the menu to see what’s fresh.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recommendations.map((item) => {
                const startingPrice = Math.min(
                  ...item.variants.map((variant) => variant.price),
                );
                return (
                  <article
                    key={item.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-[#eeece4] bg-[#fdfcf9]"
                  >
                    <Link
                      to={`/product/${item.id}`}
                      aria-label={`Order more ${item.name}`}
                      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b56b36]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[#e9eddf]">
                        <MenuItemImage
                          item={item}
                          width={600}
                          height={450}
                          imageClassName="absolute inset-0 h-full w-full object-cover"
                          fallbackClassName="absolute inset-0 flex items-center justify-center text-5xl"
                        />
                      </div>
                    </Link>
                    <div className="flex min-h-[150px] flex-col p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#b56b36]">
                        {item.category}
                      </p>
                      <h3 className="mt-1 break-words font-semibold text-[#253b2a]">
                        {item.name}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-[#31573a]">
                        From {formatPrice(startingPrice)}
                      </p>
                      {item.description && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#73796d]">
                          {item.description}
                        </p>
                      )}
                      <Link
                        to={`/product/${item.id}`}
                        className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#31573a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#25472e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
                      >
                        Order More
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {order.orderStatus !== "COMPLETED" &&
            !menuLoading &&
            !menuError &&
            recommendations.length < 2 && (
              <p className="mt-4 text-sm text-[#73796d]">
                Want more choices? Explore the full menu.
              </p>
            )}
        </section>
      )}
    </div>
  );
}
