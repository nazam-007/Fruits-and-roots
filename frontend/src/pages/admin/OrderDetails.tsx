import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  fetchAdminOrder,
  updateAdminOrderStatus,
  verifyAdminPayment,
  type AdminOrderLifecycleStatus,
  type AdminOrderDetails as OrderDetailsType,
} from "../../services/adminApi";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";

const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

function formatFulfillment(order: OrderDetailsType) {
  const orderType =
    order.order_type ??
    (order.fulfillment_type === "TABLE" ? "DINE_IN" : "TAKEAWAY");
  return orderType === "DINE_IN"
    ? `Dine-in${order.table_number ? ` · Table ${order.table_number}` : ""}`
    : "Takeaway";
}

const nextStatus: Partial<Record<AdminOrderLifecycleStatus, "PREPARING" | "READY" | "COMPLETED">> = {
  PLACED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
};

export default function AdminOrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailsType | null>(null);
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savingRef = useRef(false);

  const refresh = useCallback(async (signal: AbortSignal) => {
    if (!orderId) {
      setError("Invalid order ID.");
      setLoading(false);
      return;
    }
    if (savingRef.current) return;
    try {
      const latest = await fetchAdminOrder(orderId, signal);
      if (signal.aborted || savingRef.current) return;
      setOrder(latest);
      setError(null);
    } catch (requestError) {
      if (signal.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load order details.",
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [orderId]);

  const refreshNow = useVisiblePolling(refresh, 2000, orderId);

  const changeStatus = async () => {
    if (!order) return;
    const status = nextStatus[order.order_status];
    if (!status || saving) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateAdminOrderStatus(order.id, status);
      if (status === "COMPLETED") {
        if (result.orderStatus !== "COMPLETED") {
          throw new Error("The order was not confirmed as completed.");
        }
        const searchParams = new URLSearchParams(location.search);
        searchParams.set("status", "PLACED");
        searchParams.delete("offset");
        navigate(`/admin/orders?${searchParams.toString()}`);
        return;
      }
      setNotice(`Order moved to ${status}.`);
      savingRef.current = false;
      await refreshNow();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update order status.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const decidePayment = async (decision: "PAID" | "REJECTED") => {
    if (!order || saving) return;
    if (
      decision === "PAID" &&
      !window.confirm(
        canReconcilePayment
          ? "Confirm receipt in the merchant bank or UPI records? This will flag the cancelled or expired attempt for reconciliation only and will not place the order."
          : "Confirm that you independently matched the payment in the merchant bank or UPI records?",
      )
    ) {
      return;
    }
    if (
      decision === "REJECTED" &&
      !window.confirm("Reject this unverified payment claim?")
    ) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await verifyAdminPayment(
        order.id,
        decision,
        decision === "PAID" ? reference.trim() : undefined,
      );
      setReference("");
      setNotice(
        result.reconciliationRequired
          ? "Payment receipt confirmed. The expired or cancelled attempt is flagged for authorized reconciliation and was not placed."
          : decision === "PAID"
          ? "Manual payment marked verified."
          : "Payment claim rejected.",
      );
      savingRef.current = false;
      await refreshNow();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update payment verification.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading && !order) {
    return <p role="status" className="p-8 text-sm text-[#73796d]">Loading order details...</p>;
  }
  if (!order) {
    return (
      <section className="max-w-xl rounded-2xl border border-red-200 bg-white p-6">
        <p role="alert" className="text-sm text-red-800">{error ?? "Order not found."}</p>
        <Link to="/admin/orders" className="mt-4 inline-block font-semibold text-[#31573a]">
          Back to orders
        </Link>
      </section>
    );
  }

  const suggestedStatus = nextStatus[order.order_status];
  const canStartPreparation =
    order.payment_status === "PAID" &&
    (order.payment_source === "MANUAL_UPI" ||
      (order.payment_source === "DEMO" && order.demoPaymentsEnabled) ||
      (order.payment_source === "RAZORPAY_TEST" && order.razorpayTestEnabled));
  const canVerifyPayment =
    order.payment_status === "PENDING_VERIFICATION" &&
    order.recorded_payment_status === "PENDING_VERIFICATION" &&
    order.payment_source === "MANUAL_UPI" &&
    !order.payment_expired;
  const canReconcilePayment =
    (["CANCELLED", "EXPIRED"].includes(order.payment_status) ||
      order.payment_expired) &&
    order.payment_source === "MANUAL_UPI" &&
    ["PENDING_PAYMENT", "PENDING_VERIFICATION", "CANCELLED", "EXPIRED"].includes(
      order.recorded_payment_status ?? "",
    ) &&
    !order.reconciliation_required;
  const paymentAttemptStatus =
    order.payment_expired &&
    ["PENDING_PAYMENT", "PENDING_VERIFICATION"].includes(order.payment_status)
      ? "EXPIRED"
      : order.payment_status;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        to="/admin/orders"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#596554] hover:text-[#31573a]"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b56b36]">
            Order details
          </p>
          <h1 className="mt-1 break-all font-serif text-3xl font-semibold text-[#253b2a]">
            {order.order_number}
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

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{notice}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e4d8] bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-semibold text-[#253b2a]">Customer</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-[#73796d]">Name</dt><dd className="min-w-0 break-all text-right font-medium">{order.customer_name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Phone</dt><dd className="text-right font-medium">{order.customer_phone || "Not provided"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Order type</dt><dd className="font-medium">{formatFulfillment(order)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Placed</dt><dd className="text-right font-medium">{new Date(order.created_at).toLocaleString()}</dd></div>
          </dl>
        </section>

        <section className="rounded-2xl border border-[#e7e4d8] bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-semibold text-[#253b2a]">Payment</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Status</dt><dd className="text-right font-semibold">{order.payment_source === "DEMO" && order.payment_status === "PAID" ? "Demo Paid" : order.payment_status.replaceAll("_", " ")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Method</dt><dd className="text-right font-medium">{order.payment_source === "MANUAL_UPI" ? "UPI" : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Source</dt><dd className="text-right font-semibold">{order.payment_source === "DEMO" ? "DEMO PAYMENT" : order.payment_source ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Customer-reported reference</dt><dd className="max-w-[65%] break-all text-right font-medium">{order.transaction_reference ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Verified reference</dt><dd className="max-w-[65%] break-all text-right font-medium">{order.verified_transaction_reference ?? "—"}</dd></div>
            {order.verified_at && (
              <>
                <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Verified by</dt><dd className="text-right font-medium">{order.verified_by}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Verified at</dt><dd className="text-right font-medium">{new Date(order.verified_at).toLocaleString()}</dd></div>
              </>
            )}
          </dl>
          {canReconcilePayment && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              This attempt is {paymentAttemptStatus.toLowerCase()}. Confirming receipt will only flag it for authorized reconciliation; it will not place or fulfill the order.
            </p>
          )}
          {order.reconciliation_required && (
            <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
              Payment receipt is flagged for authorized reconciliation. This attempt remains {paymentAttemptStatus.toLowerCase()} and is not an operational order.
            </p>
          )}
          {(canVerifyPayment || canReconcilePayment) && (
            <div className="mt-5 border-t border-[#eeece4] pt-4">
              <label htmlFor="verified-reference" className="mb-1.5 block text-sm font-semibold text-[#394b38]">
                {canReconcilePayment
                  ? "Confirmed bank/UPI reference for reconciliation"
                  : "Confirmed bank/UPI reference"}
              </label>
              <input
                id="verified-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={120}
                placeholder="Enter the reference you independently verified"
                className="min-h-11 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-3 text-sm outline-none focus:border-[#78916c]"
              />
              <p className="mt-2 text-xs leading-5 text-[#73796d]">
                {canReconcilePayment
                  ? "Confirm receipt in the merchant account. This only records the payment for authorized reconciliation and does not fulfill the order."
                  : "Mark paid only after confirming receipt in the merchant account. Verified references cannot be reused."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || reference.trim().length < 4}
                  onClick={() => void decidePayment("PAID")}
                  className="min-h-10 rounded-full bg-[#31573a] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {canReconcilePayment
                    ? "Confirm and flag for reconciliation"
                    : "Verify and mark paid"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void decidePayment("REJECTED")}
                  className="min-h-10 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-800 disabled:opacity-50"
                >
                  Reject claim
                </button>
              </div>
            </div>
          )}
          {(order.payment_source === "DEMO" || order.payment_source === "RAZORPAY_TEST") && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              DEMO PAYMENT — this is not real revenue and is not eligible for manual bank verification.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[#e7e4d8] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#253b2a]">Preparation</h2>
            <p className="mt-1 text-sm text-[#73796d]">
              Current status: <strong className="text-[#394b38]">{order.order_status}</strong>
            </p>
          </div>
          {suggestedStatus && (
            <button
              type="button"
              disabled={
                saving ||
                (suggestedStatus === "PREPARING" && !canStartPreparation)
              }
              onClick={() => void changeStatus()}
              className="min-h-10 rounded-full bg-[#31573a] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              title={
                suggestedStatus === "PREPARING" && !canStartPreparation
                  ? "Payment must be verified before preparation."
                  : undefined
              }
            >
              {saving ? "Saving..." : `Move to ${suggestedStatus}`}
            </button>
          )}
        </div>
        {order.order_status === "CANCELLED" && (
          <p className="mt-3 text-sm text-red-800">Cancelled orders cannot be prepared.</p>
        )}
        {order.order_status === "COMPLETED" && (
          <p className="mt-3 text-sm text-[#73796d]">Completed orders cannot be moved backward.</p>
        )}
        {order.items.length > 0 && (
          <ul className="mt-5 divide-y divide-[#eeece4] border-t border-[#eeece4]">
            {order.items.map((item, index) => (
              <li key={`${item.productId}-${item.size}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-all font-medium text-[#394b38]">{item.productName}</p>
                  <p className="text-xs text-[#73796d]">{item.size} · Qty {item.quantity} · {formatPrice(item.unitPrice)} each</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-between border-t border-[#eeece4] pt-4 font-semibold text-[#253b2a]">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(order.total_amount)}</span>
        </div>
      </section>
      <p className="text-xs text-[#858a7e]">Order details refresh automatically every 2 seconds.</p>
    </div>
  );
}
