const stages = ["razorpay_order_validation", "razorpay_schema_check", "razorpay_database_transaction",
  "razorpay_gateway_order_creation", "razorpay_order_persistence"] as const;
type Stage = typeof stages[number];
type Category = "database" | "configuration" | "gateway" | "unknown";
const codes = new Set(["42703", "42P01", "42501", "23514", "23505", "23502", "23503",
  "40001", "40P01", "55P03", "57014", "08001", "08003", "08006", "53300", "57P01"]);
const constraints = new Set(["payments_source_check", "payments_razorpay_test_binding_check",
  "payments_razorpay_order_uidx", "payments_razorpay_payment_uidx", "payments_verified_reference_uidx",
  "payments_payment_status_check", "orders_payment_status_check", "orders_order_status_check"]);
const contexts = new WeakMap<object, { stage: Stage; category: Category }>();
function object(error: unknown): error is object { return error !== null && typeof error === "object"; }
function field(error: unknown, key: string): unknown {
  // Never invoke an error object's getters, stringify it, or inspect its message/cause.
  try { return object(error) ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined; }
  catch { return undefined; }
}
export function markRazorpayFailure(error: unknown, stage: Stage, category: Category) {
  try { if (object(error) && !contexts.has(error)) contexts.set(error, { stage, category }); }
  catch { /* Diagnostics must not replace the original failure. */ }
}
export async function observeRazorpay<T>(stage: Stage, category: Category, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { markRazorpayFailure(error, stage, category); throw error; }
}
export function logRazorpayFailure(error: unknown, sink: (line: string) => void = console.error) {
  try {
    const context = object(error) ? contexts.get(error) : undefined;
    const code = field(error, "code");
    const constraint = field(error, "constraint");
    const allowedCode = typeof code === "string" && codes.has(code) ? code : "unknown";
    sink(JSON.stringify({
      stage: context && stages.includes(context.stage) ? context.stage : "razorpay_order_validation",
      category: allowedCode !== "unknown" ? "database" : context?.category === "gateway" ? "gateway"
        : context?.category === "configuration" ? "configuration" : "unknown",
      code: allowedCode,
      constraint: typeof constraint === "string" && constraints.has(constraint) ? constraint : null,
    }));
  } catch { /* A broken logger must never interrupt payment handling. */ }
}
