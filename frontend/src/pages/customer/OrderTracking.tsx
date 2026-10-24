import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import {
  fetchOrder,
  type OrderDetails,
  type OrderStatus,
  type PaymentStatus,
} from "../../services/ordersApi";

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
const pickupMessage =
  "Your order has been received. Please wait while restaurant staff verify your payment and prepare your items. We will call your name when your order is ready.";

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    if (!orderId) {
      setError("Order not found.");
      setLoading(false);
      return;
    }

    let token: string | null;
    try {
      token = window.sessionStorage.getItem(
        `fruits-roots-order-token:${orderId}`,
      );
    } catch {
      token = null;
    }
    if (!token) {
      setError(
        "This order's secure tracking access is not available in this browser tab.",
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const latestOrder = await fetchOrder(orderId, token);
      setOrder(latestOrder);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to refresh order status.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshStatus]);

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
          onClick={() => void refreshStatus()}
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
  const createdAt = new Date(order.createdAt);

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
                  will announce your name when the order is ready.
                </>
              ) : order.orderStatus === "READY"
                ? "Your order is ready! Please collect it from the counter."
                : order.fulfillmentType === "PICKUP"
                  ? order.paymentStatus === "PENDING_PAYMENT"
                    ? "Your order is awaiting payment. Restaurant staff will confirm the payment status."
                    : order.paymentStatus === "PENDING_VERIFICATION"
                    ? pickupMessage
                    : order.paymentStatus === "PAID"
                      ? "Your payment has been verified. We will call your name when your order is ready for counter pickup."
                      : "Restaurant staff could not verify your payment. Please speak with them before collecting your order."
                  : order.paymentStatus === "PENDING_VERIFICATION"
                    ? "We have received your order and UPI transaction reference. Restaurant staff will verify your payment."
                    : order.paymentStatus === "PAID"
                      ? "Restaurant staff have verified your payment."
                      : "Restaurant staff could not verify this payment. Please speak with them."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b56b36]">
                Preparation status
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#253b2a]">
                {orderStatusLabels[order.orderStatus]}
              </h2>
            </div>
            {order.fulfillmentType === "PICKUP" ? (
              <span className="rounded-full bg-[#edf1e6] px-3 py-1 text-xs font-semibold text-[#31573a]">
                Counter Pickup
              </span>
            ) : (
              <span className="rounded-full bg-[#edf1e6] px-3 py-1 text-xs font-semibold text-[#31573a]">
                Table {order.tableNumber}
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
                    {orderStatusLabels[status]}
                  </span>
                </li>
              );
            })}
            {isCancelled && (
              <li className="font-semibold text-[#984734]">Order Cancelled</li>
            )}
          </ol>
        </section>

        <aside className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6">
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
              <dd className="text-right font-medium text-[#253b2a]">
                {order.customerName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#73796d]">Pickup type</dt>
              <dd className="font-medium text-[#253b2a]">
                {order.fulfillmentType === "PICKUP"
                  ? "Counter Pickup"
                  : `Table ${order.tableNumber ?? ""}`}
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
                <div>
                  <p className="font-medium text-[#394b38]">
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
    </div>
  );
}
