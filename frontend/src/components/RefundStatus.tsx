export type RefundInfo = {
  status: "NONE" | "PENDING" | "COMPLETED" | "UNAVAILABLE";
  amountPaise?: number | string | null;
  completedAt?: string | null;
  testMode?: boolean;
  reference?: string | null;
  recordedAt?: string | null;
  recordedBy?: string | null;
  evidenceNote?: string | null;
};

export default function RefundStatus({ refund, paidCancelled = false }: { refund?: RefundInfo; paidCancelled?: boolean }) {
  if ((!refund || ["NONE", "UNAVAILABLE"].includes(refund.status)) && !paidCancelled) return null;
  return <section aria-label="Refund status" className="my-5 rounded-2xl border border-[#e5d5af] bg-[#fffaf0] p-4 text-sm">
    <h2 className="font-semibold text-[#253b2a]">{refund?.status === "PENDING" ? "Refund Pending" : refund?.status === "COMPLETED" ? "Refund Completed" : "Refund status requires café review"}</h2>
    {refund?.testMode && <p className="mt-2 font-semibold">Test Mode — simulated refund only; no real money was transferred.</p>}
    {refund?.amountPaise != null && <p className="mt-2">Amount: ₹{(Number(refund.amountPaise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>}
    {refund?.status === "PENDING" && <p className="mt-2">Cancellation has not returned the payment. The café must complete and verify the refund separately.</p>}
    {refund?.completedAt && <p className="mt-2">Returned at: {new Date(refund.completedAt).toLocaleString("en-IN")}</p>}
    {(!refund || ["NONE", "UNAVAILABLE"].includes(refund.status)) && <p className="mt-2">No completed refund is recorded here. Contact the café to review this payment.</p>}
  </section>;
}
