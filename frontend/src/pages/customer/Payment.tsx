import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Clipboard,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useCheckout } from "../../context/CheckoutContext";
import {
  fetchOrder,
  type OrderDetails,
} from "../../services/ordersApi";
import {
  simulateDemoPayment,
  submitManualPaymentClaim,
} from "../../services/paymentsApi";

const IDEMPOTENCY_STORAGE_KEY = "fruits-roots-payment-idempotency";
const formatPrice = (price: number) => `₹${price.toLocaleString("en-IN")}`;

export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const { clearCheckoutDetails } = useCheckout();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [trackingToken] = useState<string | null>(() => {
    if (!orderId) return null;
    try {
      return window.sessionStorage.getItem(
        `fruits-roots-order-token:${orderId}`,
      );
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionReference, setTransactionReference] = useState("");
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const submittingRef = useRef(false);

  const refreshOrder = useCallback(async () => {
    if (!orderId || !trackingToken) {
      setLoading(false);
      setError("Secure access to this order is unavailable in this session.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrder(await fetchOrder(orderId, trackingToken));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load your order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId, trackingToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refreshOrder(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshOrder]);

  const copyUpiId = async () => {
    if (!order?.paymentDetails?.upiId) return;
    try {
      await navigator.clipboard.writeText(order.paymentDetails.upiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy the UPI ID. You can select and copy it manually.");
    }
  };

  const handleDemoPayment = async () => {
    if (submittingRef.current || !orderId || !trackingToken || !order) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await simulateDemoPayment(orderId, trackingToken);
      window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
      clearCart();
      clearCheckoutDetails();
      navigate(`/order/${orderId}`, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to record the demo payment. Retry safely.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleManualClaim = async () => {
    if (
      submittingRef.current ||
      !orderId ||
      !trackingToken ||
      !/^[A-Za-z0-9/-]{6,120}$/.test(transactionReference.trim())
    ) {
      setError("Enter a valid UPI reference using 6–120 letters, numbers, slashes, or hyphens.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitManualPaymentClaim(
        orderId,
        trackingToken,
        transactionReference.trim(),
      );
      setTransactionReference("");
      setClaimSubmitted(true);
      await refreshOrder();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to submit your payment reference.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!orderId || !trackingToken) return <Navigate to="/checkout" replace />;

  if (loading && !order) {
    return (
      <div role="status" className="py-20 text-center text-[#73796d]">
        Loading your order and payment details...
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
          onClick={() => void refreshOrder()}
          disabled={loading}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#31573a] px-5 font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  const paymentDetails = order.paymentDetails;
  const paymentIsPending =
    order.paymentStatus === "PENDING_PAYMENT" &&
    order.orderStatus !== "CANCELLED";

  return (
    <div className="mx-auto max-w-6xl pb-24 sm:pb-8">
      <Link
        to="/checkout"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-semibold text-[#596554] transition hover:text-[#31573a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e2d6] bg-white">
          <ArrowLeft size={17} aria-hidden="true" />
        </span>
        Back to checkout
      </Link>

      <header className="mb-6 sm:mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
          Counter pickup · {order.orderNumber}
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
          Complete Your Payment
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#73796d] sm:text-base">
          Scan the QR code using your preferred UPI app.
        </p>
      </header>

      {order.demoPaymentsEnabled && paymentIsPending && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#eed8b6] bg-[#fff8ed] p-4 text-sm font-semibold leading-6 text-[#73542f]">
          <ShieldAlert
            size={19}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[#a66a31]"
          />
          <p>DEMO MODE — No real money will be transferred.</p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#edc8bd] bg-[#fff2ee] px-4 py-3 text-sm font-medium text-[#984734]"
        >
          {error}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <section className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-[0_8px_30px_-25px_rgba(30,51,35,0.5)] sm:p-6">
          <div className="mb-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#b56b36]">
              UPI payment
            </p>
            <h2 className="font-serif text-xl font-semibold text-[#253b2a] sm:text-2xl">
              Order {order.orderNumber}
            </h2>
            <p className="mt-1 text-sm text-[#73796d]">
              Customer: {order.customerName}
            </p>
            {order.orderStatus === "CANCELLED" && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#edc8bd] bg-[#fff2ee] p-3 text-sm text-[#984734]"
              >
                This order was cancelled and cannot be paid.
              </p>
            )}
          </div>

          {paymentDetails ? (
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] sm:items-center">
              <div className="space-y-3 text-sm">
                <p className="text-[#73796d]">
                  Merchant{" "}
                  <span className="font-semibold text-[#253b2a]">
                    {paymentDetails.merchantName}
                  </span>
                </p>
                <div>
                  <p className="text-xs text-[#73796d]">UPI ID</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#253b2a]">
                      {paymentDetails.upiId}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyUpiId()}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#dfe3d8] px-3 text-xs font-semibold text-[#31573a] hover:bg-[#f2f4ed]"
                    >
                      {copied ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Clipboard size={14} aria-hidden="true" />
                      )}
                      {copied ? "Copied" : "Copy UPI ID"}
                    </button>
                  </div>
                </div>
                <p className="text-[#73796d]">
                  Currency:{" "}
                  <span className="font-semibold text-[#253b2a]">
                    {paymentDetails.currency}
                  </span>
                </p>
                <div className="border-t border-[#eeece4] pt-3">
                  <p className="text-xs text-[#73796d]">Total payable</p>
                  <p className="text-3xl font-bold tabular-nums text-[#253b2a]">
                    {formatPrice(order.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e5e2d6] bg-[#f8f8f2] p-4 text-center">
                <img
                  src={paymentDetails.qrCodeDataUrl}
                  alt={`UPI QR code for order ${order.orderNumber} totaling ${formatPrice(order.totalAmount)}`}
                  className="mx-auto h-56 w-56 max-w-full rounded-xl bg-white p-2"
                />
                <p className="mt-2 text-xs text-[#73796d]">
                  Verify recipient and amount before paying.
                </p>
              </div>
            </div>
          ) : (
            <p role="alert" className="rounded-xl bg-[#fff2ee] p-4 text-sm text-[#984734]">
              Payment configuration is unavailable. No QR code was generated.
            </p>
          )}

          {order.demoPaymentsEnabled ? (
            paymentIsPending ? (
              <div className="mt-6 border-t border-[#eeece4] pt-5">
                <p className="text-sm leading-6 text-[#596554]">
                  Use the simulation button to test order confirmation. It does
                  not initiate a UPI transfer or use the QR code.
                </p>
                <button
                  type="button"
                  onClick={() => void handleDemoPayment()}
                  disabled={submitting}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#31573a] px-6 py-3 font-semibold text-white transition hover:bg-[#25472e] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
                >
                  {submitting
                    ? "Recording demo payment..."
                    : "Simulate Successful Payment"}
                </button>
              </div>
            ) : (
              <p className="mt-6 rounded-xl bg-[#f5f5ef] p-4 text-sm text-[#596554]">
                This order has already been paid. View its status on the order
                tracking page.
              </p>
            )
          ) : (
            paymentIsPending ? (
              <div className="mt-6 border-t border-[#eeece4] pt-5">
                {claimSubmitted && (
                  <p role="status" className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
                    Reference submitted. Restaurant staff will independently verify the payment.
                  </p>
                )}
                <label
                  htmlFor="upi-reference"
                  className="mb-1.5 block text-sm font-semibold text-[#394b38]"
                >
                  UPI transaction reference
                </label>
                <input
                  id="upi-reference"
                  value={transactionReference}
                  onChange={(event) => {
                    setTransactionReference(event.target.value);
                    setClaimSubmitted(false);
                  }}
                  maxLength={120}
                  placeholder="Enter the reference from your UPI app"
                  className="min-h-12 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-4 text-sm outline-none focus:border-[#78916c]"
                />
                <p className="mt-2 text-xs leading-5 text-[#73796d]">
                  This does not prove payment. Staff will verify receipt independently.
                </p>
                <button
                  type="button"
                  onClick={() => void handleManualClaim()}
                  disabled={
                    submitting ||
                    !/^[A-Za-z0-9/-]{6,120}$/.test(transactionReference.trim())
                  }
                  className="mt-4 min-h-12 w-full rounded-full bg-[#31573a] px-6 font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Submitting reference..." : "Submit payment reference"}
                </button>
              </div>
            ) : (
              <p className="mt-6 rounded-xl bg-[#f5f5ef] p-4 text-sm leading-6 text-[#596554]">
                Payment status: {order.paymentStatus.replaceAll("_", " ")}. Check order tracking for updates.
              </p>
            )
          )}

          <p className="mt-4 text-xs leading-5 text-[#858a7e]">
            A displayed QR code or customer action does not prove payment.
            Payment status is only changed by the server’s configured payment
            workflow.
          </p>
        </section>

        <aside className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-[0_12px_36px_-28px_rgba(30,51,35,0.4)] lg:sticky lg:top-24 sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-[#253b2a] sm:text-2xl">
            Your order
          </h2>
          <p className="mt-1 text-sm text-[#73796d]">Counter pickup</p>
          <ul className="mt-5 max-h-64 space-y-3 overflow-y-auto border-b border-[#eeece4] pb-5">
            {order.items.map((item, index) => (
              <li
                key={`${item.productId}-${item.size}-${index}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#394b38]">
                    {item.productName}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7a8074]">
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
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-semibold text-[#253b2a]">Total payable</span>
            <span className="text-2xl font-bold tabular-nums text-[#253b2a]">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
