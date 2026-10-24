import type { CartItem } from "../context/CartContext";

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
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "The request could not be completed. Please try again.",
    );
  }
  return data as T;
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
): Promise<OrderDetails> {
  return readResponse(
    await fetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${trackingToken}` },
    }),
  );
}
