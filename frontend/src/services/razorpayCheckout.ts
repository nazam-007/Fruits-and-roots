const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
type Callback = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type Result = { paymentStatus: string; reconciliationRequired?: boolean };
type Checkout = { open: () => void; close: () => void; on: (event: "payment.failed", handler: () => void) => void };
type CheckoutConstructor = new (options: {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  handler: (response: Callback) => void; modal: { ondismiss: () => void };
}) => Checkout;
declare global { interface Window { Razorpay?: CheckoutConstructor } }
let scriptPromise: Promise<void> | undefined;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Test Checkout loading timed out")); }, 15000);
    script.onload = () => { window.clearTimeout(timer); if (window.Razorpay) resolve(); else reject(new Error("Test Checkout unavailable")); };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Unable to load Test Checkout")); };
    document.head.appendChild(script);
  }).catch((error: unknown) => { scriptPromise = undefined; throw error; });
}
async function request<T>(id: string, token: string, endpoint: string, body?: Callback): Promise<T> {
  const response = await fetch(`${API_URL}/api/orders/${encodeURIComponent(id)}/razorpay/${endpoint}`, {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Test payment request failed");
  return data as T;
}
export async function openRazorpayTestCheckout(id: string, token: string): Promise<Result | null> {
  await loadCheckout();
  const order = await request<{ keyId: string; razorpayOrderId: string; amount: number; currency: string; testMode: boolean }>(id, token, "order");
  if (!order.testMode || !order.keyId.startsWith("rzp_test_")) throw new Error("Only Razorpay Test Mode is supported");
  return new Promise((resolve, reject) => {
    let callbackReceived = false;
    const checkout = new window.Razorpay!({
      key: order.keyId, order_id: order.razorpayOrderId, amount: order.amount, currency: order.currency,
      name: "Fruits & Roots", description: "TEST PAYMENT — no real money",
      handler: (response) => {
        if (callbackReceived) return;
        callbackReceived = true;
        void request<Result>(id, token, "verify", response).then(resolve, reject);
      },
      modal: { ondismiss: () => { if (!callbackReceived) resolve(null); } },
    });
    checkout.on("payment.failed", () => { if (!callbackReceived) { checkout.close(); resolve(null); } });
    checkout.open();
  });
}
