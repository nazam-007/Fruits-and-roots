import type { CartItem } from "../context/cartContextStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type OrderStatus =
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentStatus =
  | "PENDING_PAYMENT"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "REJECTED";

export type PaymentSource = "DEMO" | "MANUAL_UPI" | null;

export type OrderLine = {
  productId: string;
  productName: string;
  size: CartItem["size"];
  quantity: number;
  unitPrice: number;
};

export type OrderDetails = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  fulfillmentType: "PICKUP" | "TABLE";
  tableNumber: string | null;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentSource: PaymentSource;
  orderStatus: OrderStatus;
  createdAt: string;
  items: OrderLine[];
  paymentDetails?: {
    merchantName: string;
    upiId: string;
    currency: "INR";
    paymentUri: string;
    qrCodeDataUrl: string;
  } | null;
  demoPaymentsEnabled?: boolean;
};

export type PaymentQuote = {
  configured: boolean;
  merchantName?: string;
  upiId?: string;
  currency?: "INR";
  totalAmount: number;
  items: OrderLine[];
  paymentUri?: string;
  qrCodeDataUrl?: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new OrderApiError(
      typeof data?.message === "string"
        ? data.message
        : "The request could not be completed. Please try again.",
      response.status,
    );
  }
  return data as T;
}

export class OrderApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OrderApiError";
    this.status = status;
  }
}

export async function fetchPaymentConfiguration(): Promise<{
  configured: boolean;
  upiId?: string;
  merchantName?: string;
  currency?: "INR";
  demoPaymentsEnabled: boolean;
}> {
  return readResponse(
    await fetch(`${API_URL}/api/payment-config`),
  );
}

export async function requestPaymentQuote(input: {
  fulfillmentType: "PICKUP" | "TABLE";
  tableNumber?: string;
  items: Array<{
    productId: string;
    size: CartItem["size"];
    quantity: number;
  }>;
}): Promise<PaymentQuote> {
  return readResponse(
    await fetch(`${API_URL}/api/orders/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function submitOrder(
  input: {
    customerName: string;
    customerPhone?: string;
    fulfillmentType: "PICKUP" | "TABLE";
    tableNumber?: string;
    items: Array<{
      productId: string;
      size: CartItem["size"];
      quantity: number;
    }>;
    idempotencyKey: string;
  },
): Promise<OrderDetails & { trackingToken: string }> {
  return readResponse(
    await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchOrder(
  orderId: string,
  trackingToken: string,
  signal?: AbortSignal,
): Promise<OrderDetails> {
  return readResponse(
    await fetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${trackingToken}` },
      signal,
    }),
  );
}

export async function streamOrderStatus(
  orderId: string,
  trackingToken: string,
  signal: AbortSignal,
  onStatus: (status: OrderStatus) => void,
  onOpen: () => void,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/orders/${encodeURIComponent(orderId)}/events`,
    {
      headers: { Authorization: `Bearer ${trackingToken}` },
      signal,
    },
  );
  if (!response.ok) {
    throw new OrderApiError("Live order updates are unavailable.", response.status);
  }
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("The live order update stream is unavailable.");
  }
  if (!response.body) {
    throw new Error("Streaming is not supported by this connection.");
  }

  onOpen();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0];
        if (!separator) break;
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + separator.length);
        let eventType = "message";
        const dataLines: string[] = [];

        for (const line of message.split(/\r?\n/)) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (eventType === "status" && dataLines.length > 0) {
          try {
            const payload = JSON.parse(dataLines.join("\n")) as {
              orderStatus?: OrderStatus;
            };
            if (payload.orderStatus) onStatus(payload.orderStatus);
          } catch {
            throw new Error("The live order update was invalid.");
          }
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function cancelOrder(
  orderId: string,
  trackingToken: string,
): Promise<{ orderId: string; orderStatus: "CANCELLED"; refundReviewRequired: boolean }> {
  return readResponse(
    await fetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${trackingToken}` },
    }),
  );
}
