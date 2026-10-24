import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  fetchAdminOrder,
  updateAdminOrderStatus,
  verifyAdminPayment,
  type AdminOrderDetails as OrderDetailsType,
  type AdminOrderStatus,
} from "../../services/adminApi";

const formatPrice = (amount: number) =>
  `₹${Number(amount).toLocaleString("en-IN")}`;

const nextStatus: Partial<Record<AdminOrderStatus, "PREPARING" | "READY" | "COMPLETED">> = {
  PLACED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
};

export default function AdminOrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderDetailsType | null>(null);
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (!orderId) {
      setError("Invalid order ID.");
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      setOrder(await fetchAdminOrder(orderId));
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load order details.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => void refresh(true), 0);
    const intervalId = window.setInterval(() => void refresh(), 7000);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const changeStatus = async () => {
    if (!order) return;
    const status = nextStatus[order.order_status];
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateAdminOrderStatus(order.id, status);
      setNotice(`Order moved to ${status}.`);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update order status.",
      );
    } finally {
      setSaving(false);
    }
  };

  const decidePayment = async (decision: "PAID" | "REJECTED") => {
    if (!order || saving) return;
    if (
      decision === "PAID" &&
      !window.confirm(
        "Confirm that you independently matched the payment in the merchant bank or UPI records?",
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
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await verifyAdminPayment(
        order.id,
        decision,
        decision === "PAID" ? reference.trim() : undefined,
      );
      setReference("");
      setNotice(
        decision === "PAID"
          ? "Manual payment marked verified."
          : "Payment claim rejected.",
      );
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update payment verification.",
      );
    } finally {
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
      (order.payment_source === "DEMO" && order.demoPaymentsEnabled));
  const canVerifyPayment =
    order.payment_status === "PENDING_VERIFICATION" &&
    order.recorded_payment_status === "PENDING_VERIFICATION" &&
    order.payment_source === "MANUAL_UPI";

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
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b56b36]">
            Order details
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#253b2a]">
            {order.order_number}
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

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{notice}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e7e4d8] bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-semibold text-[#253b2a]">Customer</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Name</dt><dd className="text-right font-medium">{order.customer_name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Phone</dt><dd className="text-right font-medium">{order.customer_phone || "Not provided"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#73796d]">Pickup type</dt><dd className="font-medium">{order.fulfillment_type === "PICKUP" ? "Counter pickup" : "Table"}</dd></div>
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
          {canVerifyPayment && (
            <div className="mt-5 border-t border-[#eeece4] pt-4">
              <label htmlFor="verified-reference" className="mb-1.5 block text-sm font-semibold text-[#394b38]">
                Confirmed bank/UPI reference
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
                Mark paid only after confirming receipt in the merchant account. Verified references cannot be reused.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || reference.trim().length < 4}
                  onClick={() => void decidePayment("PAID")}
                  className="min-h-10 rounded-full bg-[#31573a] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Verify and mark paid
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
          {order.payment_source === "DEMO" && (
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
                <div>
                  <p className="font-medium text-[#394b38]">{item.productName}</p>
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
      <p className="text-xs text-[#858a7e]">Order details refresh automatically every 7 seconds.</p>
    </div>
  );
}
