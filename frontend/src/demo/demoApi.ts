import snapshot from "../data/static-menu.snapshot.json" with { type: "json" };
import { menuItems } from "../data/menu";
import type { OrderDetails, OrderLine, OrderStatus } from "../services/ordersApi";
import type { AdminCategory, AdminMenuProduct, AdminMenuProductInput, AdminMenuTag } from "../services/adminApi";
import type { OpeningHours, RestaurantOrderingStatus } from "../services/menuApi";

const KEY = "fr-demo:state:v1";
export const DEMO_EVENT = "fr-demo-change";
const now = () => new Date().toISOString();
type LocalOrder = OrderDetails & { trackingToken: string; idempotencyKey: string };
type State = { version: 1; menu: AdminMenuProduct[]; categories: AdminCategory[]; tags: AdminMenuTag[]; orders: LocalOrder[]; admin: boolean; settings: RestaurantOrderingStatus };
function initialState(): State {
  const categories = snapshot.categories.map(c => ({ id: `demo-category-${c.sort_order}`, name: c.name, sortOrder: c.sort_order }));
  return { version: 1, categories, tags: [], admin: false, orders: [],
    menu: snapshot.products.map(item => ({ id: item.id, name: item.name, category: item.category, categoryId: categories.find(c => c.name === item.category)!.id,
      description: menuItems.find(p => p.id === item.id)?.description ?? null, image: null,
      availabilityStatus: item.availabilityStatus as AdminMenuProduct["availabilityStatus"], featured: menuItems.find(p => p.id === item.id)?.featured ?? false,
      archived: false, tags: [], variants: item.variants.map(v => ({ size: v.size as "Regular" | "Large", price: v.price })) })),
    settings: { acceptingOrders: true, orderingAvailable: true, updatedAt: now(), status: "OPEN", isScheduledOpen: true, nextOpenAt: null, timeZone: "Asia/Kolkata",
      openingHours: Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => [day, { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "23:59" }])) as OpeningHours },
  };
}
function read(): State {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; if (s.version === 1 && Array.isArray(s.menu) && Array.isArray(s.orders)) return s; } } catch { /* Ignore corrupt demo state, never read production keys. */ }
  return initialState();
}
/** Demo access belongs to this origin's local order store, not a production session. */
export function readDemoTrackingAccess(id: string): string | null {
  if (!id.startsWith("demo-")) return null;
  const local = read().orders.find(o => o.orderId === id && o.paymentSource === "DEMO");
  return typeof local?.trackingToken === "string" && local.trackingToken.length > 0 ? local.trackingToken : null;
}
function save(s: State) {
  if (s.orders.length > 50) throw new Error("Demo limit reached. Reset demo data to start again.");
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { throw new Error("Browser demo storage is unavailable or full. No order was submitted."); }
  window.dispatchEvent(new Event(DEMO_EVENT));
}
export function resetDemo() {
  for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.startsWith("fr-demo:")) storage.removeItem(key);
  window.location.assign("/menu");
}
class DemoError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function order(s: State, id: string, token?: string) {
  const o = s.orders.find(o => o.orderId === id);
  if (!o || (token !== undefined && o.trackingToken !== token)) throw new DemoError("Demo order not found in this browser.", 404);
  return o;
}
type CartLine = { productId: string; size: "Regular" | "Large"; quantity: number };
function quote(s: State, items: CartLine[]): { configured: true; items: OrderLine[]; totalAmount: number } {
  if (!s.settings.acceptingOrders || !items?.length) throw new DemoError("Demo ordering is paused or your cart is empty.", 409);
  const lines = items.map(line => {
    const p = s.menu.find(p => p.id === line.productId && !p.archived && p.availabilityStatus === "AVAILABLE"), v = p?.variants.find(v => v.size === line.size);
    if (!p || !v || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new DemoError("Demo item or quantity is unavailable.", 409);
    return { ...line, productName: p.name, unitPrice: v.price };
  });
  return { configured: true, items: lines, totalAmount: lines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) };
}
function adminRow(o: LocalOrder) {
  return { id: o.orderId, order_number: o.orderNumber, customer_name: o.customerName, customer_phone: null, fulfillment_type: o.fulfillmentType,
    order_type: o.orderType, table_number: o.tableNumber, total_amount: o.totalAmount, payment_status: o.paymentStatus, order_status: o.orderStatus,
    created_at: o.createdAt, payment_source: "DEMO", refund_status: "NONE", transaction_reference: null, reconciliation_required: false };
}
function counts(orders: LocalOrder[]) {
  return Object.fromEntries(["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map(status => [status, status === "ALL" ? orders.length : orders.filter(o => o.orderStatus === status).length]));
}
function menuProduct(s: State, input: AdminMenuProductInput, id: string): AdminMenuProduct {
  const c = s.categories.find(c => c.name === input.category);
  if (!c) throw new DemoError("Demo category not found.");
  if (input.image && !input.image.startsWith("/demo-menu/")) throw new DemoError("Only bundled images are allowed in this demo.");
  if (!Number.isFinite(input.regularPrice) || input.regularPrice < 0 || (input.largePrice !== null && (!Number.isFinite(input.largePrice) || input.largePrice < 0))) throw new DemoError("Invalid demo price.");
  return { id, name: input.name, description: input.description, category: c.name, categoryId: c.id, image: input.image,
    availabilityStatus: input.availabilityStatus, featured: input.featured, archived: false, tags: s.tags.filter(t => input.tagIds.includes(t.id)),
    variants: [{ size: "Regular", price: input.regularPrice }, ...(input.largePrice === null ? [] : [{ size: "Large" as const, price: input.largePrice }])] };
}
type Body = Record<string, unknown>;
function adminRequest(s: State, path: string, method: string, b: Body, params: URLSearchParams): unknown {
  if (path === "/auth/login") { s.admin = true; save(s); return { adminId: "Demo admin" }; }
  if (!s.admin) throw new DemoError("Enter the browser-local admin demo.", 401);
  if (path === "/auth/session") return { adminId: "Demo admin" };
  if (path === "/auth/logout") { s.admin = false; save(s); return null; }
  const orders = s.orders.filter(o => o.paymentStatus === "PAID");
  if (path === "/dashboard") {
    const c = counts(orders), today = orders.filter(o => o.createdAt.slice(0, 10) === now().slice(0, 10));
    return { demoPaymentsEnabled: true, summary: { total_orders: c.ALL, total_orders_today: today.length, new_orders: c.PLACED, preparing_orders: c.PREPARING, ready_orders: c.READY, completed_orders: c.COMPLETED, cancelled_orders: c.CANCELLED, verified_revenue_today: 0, demo_revenue_today: today.reduce((sum, o) => sum + o.totalAmount, 0) } };
  }
  if (path === "/restaurant/settings") {
    if (method === "PATCH") {
      if (typeof b.acceptingOrders === "boolean") Object.assign(s.settings, { acceptingOrders: b.acceptingOrders, orderingAvailable: b.acceptingOrders, status: b.acceptingOrders ? "OPEN" : "PAUSED" });
      if (b.openingHours) s.settings.openingHours = b.openingHours as OpeningHours;
      s.settings.updatedAt = now(); save(s);
    }
    return s.settings;
  }
  if (path === "/payment-claims" || path === "/payment-reconciliation") return { items: [], total: 0, totalPages: 1, limit: 15, offset: 0 };
  if (path === "/orders") {
    const date = params.get("date"), all = orders.filter(o => !date || o.createdAt.slice(0, 10) === date).reverse();
    const status = params.get("status") || "ALL", filtered = status === "ALL" ? all : all.filter(o => o.orderStatus === status);
    const limit = Math.max(1, Number(params.get("limit")) || 15), page = Math.max(1, Number(params.get("page")) || 1), offset = params.has("page") ? (page - 1) * limit : Number(params.get("offset")) || 0;
    const items = filtered.slice(offset, offset + limit).map(adminRow);
    return { items, orders: items, counts: counts(all), page, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)), limit, offset };
  }
  const match = path.match(/^\/orders\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const o = order(s, match[1]);
    if (match[2] === "status" && method === "PATCH") {
      const next: Partial<Record<OrderStatus, string>> = { PLACED: "PREPARING", PREPARING: "READY", READY: "COMPLETED" };
      if (o.paymentStatus !== "PAID" || next[o.orderStatus] !== b.status) throw new DemoError("Invalid demo status transition.", 409);
      o.orderStatus = b.status as OrderStatus; save(s); return { orderId: o.orderId, orderStatus: o.orderStatus };
    }
    if (match[2]) throw new DemoError("No bank verification or real refunds are available in the demo.", 409);
    return { ...adminRow(o), refund: o.refund, recorded_payment_status: o.paymentStatus, verified_transaction_reference: null, verified_by: null, verified_at: null,
      reconciliation_flagged_at: null, payment_expires_at: o.createdAt, payment_expired: false, items: o.items, demoPaymentsEnabled: true, razorpayTestEnabled: false };
  }
  if (path === "/menu" && method === "GET") return s.menu.filter(p => params.get("includeArchived") === "true" || !p.archived);
  if (path === "/menu" && method === "POST") { const p = menuProduct(s, b as unknown as AdminMenuProductInput, `demo-product-${crypto.randomUUID()}`); s.menu.push(p); save(s); return p; }
  const product = path.match(/^\/menu\/([^/]+)(?:\/(.*))?$/);
  if (product) {
    const p = s.menu.find(p => p.id === product[1]); if (!p) throw new DemoError("Demo product not found.", 404);
    if (product[2] === "image") throw new DemoError("Image uploads are disabled. The original bundled images are preserved.");
    if (product[2] === "status") p.availabilityStatus = b.availabilityStatus as AdminMenuProduct["availabilityStatus"];
    else if (product[2] === "archive") p.archived = b.archived === true;
    else if (method === "DELETE") { p.archived = true; save(s); return { deleted: false, archived: true, message: "Archived in browser demo only." }; }
    else Object.assign(p, menuProduct(s, b as unknown as AdminMenuProductInput, p.id), { archived: p.archived });
    save(s); return p;
  }
  if (path === "/categories/order") {
    const ids = b.categoryIds as string[];
    if (!Array.isArray(ids) || ids.length !== s.categories.length || new Set(ids).size !== ids.length) throw new DemoError("Invalid demo category order.");
    s.categories = ids.map((id, sortOrder) => { const c = s.categories.find(c => c.id === id); if (!c) throw new DemoError("Category not found."); return { ...c, sortOrder }; }); save(s); return s.categories;
  }
  for (const collection of ["categories", "tags"] as const) {
    const list = s[collection];
    if (path === `/${collection}` && method === "GET") return list;
    if (path === `/${collection}` && method === "POST") {
      const item = collection === "categories" ? { id: crypto.randomUUID(), name: String(b.name), sortOrder: list.length } : { id: crypto.randomUUID(), name: String(b.name), productCount: 0 };
      (list as (AdminCategory | AdminMenuTag)[]).push(item); save(s); return item;
    }
    if (path.startsWith(`/${collection}/`)) {
      const id = path.split("/")[2], item = list.find(c => c.id === id); if (!item) throw new DemoError("Demo entry not found.", 404);
      if (method === "DELETE") {
        if (collection === "categories" && s.menu.some(p => p.categoryId === id)) throw new DemoError("This category still contains products.");
        if (collection === "categories") s.categories = s.categories.filter(c => c.id !== id); else { s.tags = s.tags.filter(t => t.id !== id); for (const p of s.menu) p.tags = p.tags.filter(t => t.id !== id); }
      } else { item.name = String(b.name); for (const p of s.menu) { if (collection === "categories" && p.categoryId === id) p.category = item.name; if (collection === "tags") for (const t of p.tags) if (t.id === id) t.name = item.name; } }
      save(s); return item;
    }
  }
  throw new DemoError("This operation is unavailable in the browser demo.", 404);
}

// This is a local adapter with the fetch signature, NOT a network fetch/mock server.
// Unknown endpoints fail closed. There is deliberately no network fallback.
export const demoFetch: typeof fetch = async (input, init = {}) => {
  try {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://browser-demo.invalid");
    if (url.origin !== "https://browser-demo.invalid") throw new DemoError("External services are disabled in demo mode.", 403);
    const s = read(), method = init.method || "GET", b: Body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    const path = decodeURI(url.pathname); let result: unknown;
    if (path.startsWith("/api/admin/")) result = adminRequest(s, path.slice(10), method, b, url.searchParams);
    else if (path === "/api/menu/status") result = s.settings;
    else if (path === "/api/menu") result = s.menu.filter(p => !p.archived).map(p => ({ ...p, available: p.availabilityStatus === "AVAILABLE", image: p.image ?? undefined, tags: p.tags.map(t => t.name) }));
    else if (path === "/api/payment-config") result = { configured: true, demoPaymentsEnabled: true, razorpayTestEnabled: false };
    else if (path === "/api/orders/quote") result = quote(s, b.items as CartLine[]);
    else if (path === "/api/orders" && method === "POST") {
      const previous = s.orders.find(o => o.idempotencyKey === b.idempotencyKey);
      if (previous) result = previous;
      else {
        if (typeof b.customerName !== "string" || b.customerName.trim().length < 2 || typeof b.idempotencyKey !== "string") throw new DemoError("Use a demo name and valid cart.");
        const priced = quote(s, b.items as CartLine[]);
        const o: LocalOrder = { orderId: `demo-${crypto.randomUUID()}`, orderNumber: `DEMO-${String(s.orders.length + 1).padStart(4, "0")}`,
          customerName: b.customerName.trim().slice(0, 120), orderType: b.orderType === "DINE_IN" ? "DINE_IN" : "TAKEAWAY", fulfillmentType: "PICKUP", tableNumber: typeof b.tableNumber === "string" ? b.tableNumber : null,
          totalAmount: priced.totalAmount, items: priced.items, paymentStatus: "PENDING_PAYMENT", paymentSource: "DEMO", orderStatus: "PENDING_PAYMENT", createdAt: now(), trackingToken: crypto.randomUUID(), idempotencyKey: b.idempotencyKey,
          paymentDetails: null, demoPaymentsEnabled: true, razorpayTestEnabled: false, refund: { status: "NONE", testMode: true } };
        s.orders.push(o); save(s); result = o;
      }
    } else {
      const match = path.match(/^\/api\/orders\/([^/]+)(?:\/(.*))?$/);
      if (!match) throw new DemoError("Demo operation unavailable.", 404);
      const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "");
      if (!token) throw new DemoError("Demo tracking access is missing.", 401);
      const o = order(s, match[1], token), action = match[2];
      if (!action && method === "GET") result = o;
      else if (action === "demo-payment" && method === "POST") {
        if (o.orderStatus === "CANCELLED" || !["PENDING_PAYMENT", "PAID"].includes(o.paymentStatus)) throw new DemoError("Demo payment attempt has ended.", 409);
        if (o.paymentStatus !== "PAID") { o.paymentStatus = "PAID"; o.orderStatus = "PLACED"; save(s); }
        result = { paymentStatus: "PAID", paymentSource: "DEMO" };
      } else if (action === "payment-cancel" && method === "POST") {
        if (o.paymentStatus === "PAID") throw new DemoError("Use order cancellation after simulated payment.", 409);
        o.paymentStatus = "CANCELLED"; o.orderStatus = "CANCELLED"; save(s); result = { orderId: o.orderId, paymentStatus: "CANCELLED" };
      } else if (action === "cancel" && method === "POST") {
        if (o.orderStatus !== "PLACED") throw new DemoError("Only placed demo orders can be cancelled.", 409);
        o.orderStatus = "CANCELLED"; save(s); result = { orderId: o.orderId, orderStatus: "CANCELLED", refundReviewRequired: false };
      } else throw new DemoError("Only browser-local demo payment is available.", 409);
    }
    return Response.json(result ?? null);
  } catch (e) { return Response.json({ message: e instanceof Error ? e.message : "Demo operation failed." }, { status: e instanceof DemoError ? e.status : 400 }); }
};
