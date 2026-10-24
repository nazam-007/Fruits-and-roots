const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "The payment request could not be completed.",
    );
  }
  return data as T;
}

export async function submitManualPaymentClaim(
  orderId: string,
  trackingToken: string,
  transactionReference: string,
) {
  return readResponse<{ orderId: string; paymentStatus: "PENDING_VERIFICATION" }>(
    await fetch(
      `${API_URL}/api/orders/${encodeURIComponent(orderId)}/payment-claim`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trackingToken}`,
        },
        body: JSON.stringify({ transactionReference }),
      },
    ),
  );
}

export async function simulateDemoPayment(
  orderId: string,
  trackingToken: string,
) {
  return readResponse<{
    paymentStatus: "PAID";
    paymentSource: "DEMO";
  }>(
    await fetch(
      `${API_URL}/api/orders/${encodeURIComponent(orderId)}/demo-payment`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${trackingToken}` },
      },
    ),
  );
}
