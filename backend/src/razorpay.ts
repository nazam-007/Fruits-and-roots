import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayConfig = { keyId: string; secret: string; webhookSecret?: string };
export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  if (!env.RAZORPAY_MODE || env.RAZORPAY_MODE === "off") return null;
  if (env.RAZORPAY_MODE !== "test" || !/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID || "") || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay requires test mode and valid test credentials");
  }
  if (env.NODE_ENV === "production") throw new Error("Razorpay Test Mode is forbidden in production");
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("Razorpay requires trusted TLS verification");
  if (!["development", "test"].includes(env.NODE_ENV || "")) throw new Error("Explicit development/test environment required for Razorpay");
  return { keyId: env.RAZORPAY_KEY_ID!, secret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || undefined };
}
export function razorpayTestEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return razorpayConfig() !== null;
}
export function verifyRazorpaySignature(body: string | Buffer, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function amountInPaise(rupees: number) {
  const amount = rupees * 100;
  if (!Number.isSafeInteger(rupees) || rupees <= 0 || !Number.isSafeInteger(amount)) throw new Error("Invalid stored order amount");
  return amount;
}
export type GatewayPayment = { id: string; order_id: string; amount: number; currency: string; status: string;
  captured: boolean; amount_refunded?: number; refund_status?: string | null };
export type Gateway = { createOrder: (amount: number, receipt: string) => Promise<{ id: string; amount: number; currency: string }>;
  fetchPayment: (id: string) => Promise<GatewayPayment> };
export function razorpayGateway(config: RazorpayConfig, fetcher: typeof fetch = fetch): Gateway {
  async function request(path: string, body?: unknown) {
    try {
      const response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
        method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.secret}`).toString("base64")}`,
          "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      return await response.json();
    } catch { throw new Error("Razorpay test service unavailable"); }
  }
  return { createOrder: (amount, receipt) => request("orders", { amount, currency: "INR", receipt }),
    fetchPayment: (id) => request(`payments/${encodeURIComponent(id)}`) };
}
