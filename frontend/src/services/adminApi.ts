const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type AdminOrderStatus =
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
export type AdminPaymentStatus =
  | "PENDING_PAYMENT"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "REJECTED";
export type AdminPaymentSource = "DEMO" | "MANUAL_UPI" | null;

export type AdminOrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  fulfillment_type: "PICKUP" | "TABLE";
  total_amount: number;
  payment_status: AdminPaymentStatus;
  order_status: AdminOrderStatus;
  created_at: string;
  payment_source: AdminPaymentSource;
};

export type AdminOrderDetails = AdminOrderRow & {
  recorded_payment_status: AdminPaymentStatus | null;
  transaction_reference: string | null;
  verified_transaction_reference: string | null;
  verified_by: string | null;
  verified_at: string | null;
  items: Array<{
    productId: string;
    productName: string;
    size: "Regular" | "Large";
    quantity: number;
    unitPrice: number;
  }>;
  demoPaymentsEnabled: boolean;
};

export type AdminDashboardData = {
  summary: {
    total_orders_today: number;
    new_orders: number;
    preparing_orders: number;
    ready_orders: number;
    completed_orders: number;
    verified_revenue_today: number;
    demo_revenue_today: number;
  };
  recentOrders: AdminOrderRow[];
  demoPaymentsEnabled: boolean;
};

export type AdminMenuProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  image: string | null;
  availabilityStatus: "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
  featured: boolean;
  archived: boolean;
  variants: Array<{ size: "Regular" | "Large"; price: number }>;
};

export type AdminMenuProductInput = {
  name: string;
  description: string;
  category: string;
  image: string | null;
  availabilityStatus: "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
  featured: boolean;
  regularPrice: number;
  largePrice: number | null;
};

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}/api/admin${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const data = response.status === 204
    ? null
    : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      window.dispatchEvent(new Event("admin-session-expired"));
    }
    throw new AdminApiError(
      typeof data?.message === "string"
        ? data.message
        : "The admin request could not be completed.",
      response.status,
    );
  }
  return data as T;
}

export function loginAdmin(username: string, password: string) {
  return request<{ adminId: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchAdminSession() {
  return request<{ adminId: string }>("/auth/session");
}

export function logoutAdmin() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function fetchDashboard() {
  return request<AdminDashboardData>("/dashboard");
}

export function fetchAdminOrders(
  status: "ALL" | AdminOrderStatus,
  limit: number,
  offset: number,
) {
  const query = new URLSearchParams({
    status,
    limit: String(limit),
    offset: String(offset),
  });
  return request<{ items: AdminOrderRow[]; total: number; limit: number; offset: number }>(
    `/orders?${query}`,
  );
}

export function fetchAdminOrder(orderId: string) {
  return request<AdminOrderDetails>(
    `/orders/${encodeURIComponent(orderId)}`,
  );
}

export function updateAdminOrderStatus(
  orderId: string,
  status: "PREPARING" | "READY" | "COMPLETED",
) {
  return request<{ orderId: string; orderStatus: AdminOrderStatus }>(
    `/orders/${encodeURIComponent(orderId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export function verifyAdminPayment(
  orderId: string,
  decision: "PAID" | "REJECTED",
  verifiedTransactionReference?: string,
) {
  return request<{ orderId: string; paymentStatus: AdminPaymentStatus }>(
    `/orders/${encodeURIComponent(orderId)}/payment-verification`,
    {
      method: "POST",
      body: JSON.stringify({ decision, verifiedTransactionReference }),
    },
  );
}

export function fetchAdminMenu(includeArchived = true) {
  return request<AdminMenuProduct[]>(
    `/menu${includeArchived ? "?includeArchived=true" : ""}`,
  );
}

export function createAdminMenuProduct(input: AdminMenuProductInput) {
  return request<AdminMenuProduct>("/menu", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminMenuProduct(
  productId: string,
  input: AdminMenuProductInput,
) {
  return request<AdminMenuProduct>(
    `/menu/${encodeURIComponent(productId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function updateAdminMenuStatus(
  productId: string,
  availabilityStatus: AdminMenuProductInput["availabilityStatus"],
) {
  return request<AdminMenuProduct>(
    `/menu/${encodeURIComponent(productId)}/status`,
    { method: "PATCH", body: JSON.stringify({ availabilityStatus }) },
  );
}

export function updateAdminMenuArchive(productId: string, archived: boolean) {
  return request<AdminMenuProduct>(
    `/menu/${encodeURIComponent(productId)}/archive`,
    { method: "PATCH", body: JSON.stringify({ archived }) },
  );
}

export function uploadAdminMenuImage(productId: string, dataUrl: string) {
  return request<{ imageUrl: string }>(
    `/menu/${encodeURIComponent(productId)}/image`,
    {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
    },
  );
}
