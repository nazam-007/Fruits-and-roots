import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useCheckout } from "../../context/CheckoutContext";
import { useMenu } from "../../context/MenuContext";
import { submitOrder } from "../../services/ordersApi";

const formatPrice = (price: number) => `₹${price.toLocaleString("en-IN")}`;
const IDEMPOTENCY_STORAGE_KEY = "fruits-roots-payment-idempotency";

function isValidOptionalPhone(phone: string) {
  if (!phone) return true;
  const normalized = phone.replace(/[()\s-]/g, "");
  return /^\+?\d{7,15}$/.test(normalized);
}

type SavedIdempotencyKey = {
  fingerprint: string;
  key: string;
};

async function getIdempotencyKey(fingerprint: string) {
  try {
    const stored = window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SavedIdempotencyKey;
      if (parsed.fingerprint === fingerprint && typeof parsed.key === "string") {
        return parsed.key;
      }
    }

    const saved = { fingerprint, key: window.crypto.randomUUID() };
    window.sessionStorage.setItem(
      IDEMPOTENCY_STORAGE_KEY,
      JSON.stringify(saved),
    );
    return saved.key;
  } catch {
    throw new Error(
      "Secure order submission is unavailable in this browser session. Please reload and try again.",
    );
  }
}

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, cartCount } = useCart();
  const { checkoutDetails, saveCheckoutDetails } = useCheckout();
  const {
    menuItems,
    loading: menuLoading,
    error: menuError,
    refreshMenu,
  } = useMenu();
  const [customerName, setCustomerName] = useState(
    checkoutDetails?.customerName ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    checkoutDetails?.customerPhone ?? "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const checkoutItems = cart.map((item) => {
    const product = menuItems.find((menuItem) => menuItem.id === item.id);
    const variant = product?.variants.find((menuVariant) => menuVariant.size === item.size);
    return {
      ...item,
      name: product?.name ?? item.name,
      price: variant?.price ?? item.price,
      available: product?.available === true && Boolean(variant),
    };
  });
  const cartItemsAreAvailable =
    !menuLoading && !menuError && cart.length > 0 && checkoutItems.every((item) => item.available);
  const currentCartTotal = checkoutItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  useEffect(() => {
    if (cart.length === 0) navigate("/cart", { replace: true });
  }, [cart.length, navigate]);

  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const name = customerName.trim();
    const phone = customerPhone.trim();

    if (name.length < 2) {
      setFormError("Enter your name using at least 2 characters.");
      return;
    }
    if (!isValidOptionalPhone(phone)) {
      setFormError("Enter a valid phone number or leave it blank.");
      return;
    }
    if (!cart.length) {
      navigate("/cart", { replace: true });
      return;
    }
    if (!cartItemsAreAvailable) {
      setFormError(
        "One or more items are unavailable. Please review your cart before continuing.",
      );
      return;
    }

    try {
      saveCheckoutDetails({ customerName: name, customerPhone: phone });
      submittingRef.current = true;
      setSubmitting(true);
      const request = {
        customerName: name,
        ...(phone ? { customerPhone: phone } : {}),
        fulfillmentType: "PICKUP" as const,
        items: cart.map(({ id, size, quantity }) => ({
          productId: id,
          size,
          quantity,
        })),
      };
      const fingerprint = JSON.stringify(request);
      const idempotencyKey = await getIdempotencyKey(fingerprint);
      const order = await submitOrder({ ...request, idempotencyKey });
      window.sessionStorage.setItem(
        `fruits-roots-order-token:${order.orderId}`,
        order.trackingToken,
      );
      navigate(`/payment/${order.orderId}`);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create your order. Your cart is saved; please try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (cart.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl pb-24 sm:pb-0">
      <Link
        to="/cart"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-semibold text-[#596554] transition hover:text-[#31573a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e2d6] bg-white">
          <ArrowLeft size={17} aria-hidden="true" />
        </span>
        Back to your bag
      </Link>

      <div className="mb-6 sm:mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
          One last thing
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
          Checkout
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#73796d] sm:text-base">
          Complete your order for counter pickup.
        </p>
      </div>

      {formError && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-[#edc8bd] bg-[#fff2ee] px-4 py-3 text-sm font-medium text-[#984734]"
        >
          {formError}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <form
          id="checkout-form"
          onSubmit={handleContinue}
          onChange={() => setFormError(null)}
          className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-[0_8px_30px_-25px_rgba(30,51,35,0.5)] sm:p-6"
        >
          <div className="mb-5">
            <h2 className="font-serif text-xl font-semibold text-[#253b2a] sm:text-2xl">
              Your details
            </h2>
            <p className="mt-1 text-sm text-[#73796d]">
              We will call your name when your pickup order is ready.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="customer-name"
                className="mb-1.5 block text-sm font-semibold text-[#394b38]"
              >
                Your name <span className="text-[#b14e37]">*</span>
              </label>
              <input
                id="customer-name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="e.g. Aditi Sharma"
                className="min-h-12 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-4 py-3 text-base text-[#253b2a] outline-none transition placeholder:text-[#9a9e94] focus:border-[#78916c] focus:ring-2 focus:ring-[#31573a]/15 sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="customer-phone"
                className="mb-1.5 block text-sm font-semibold text-[#394b38]"
              >
                Phone number{" "}
                <span className="font-normal text-[#858a7e]">(optional)</span>
              </label>
              <input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="+91 98765 43210"
                className="min-h-12 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-4 py-3 text-base text-[#253b2a] outline-none transition placeholder:text-[#9a9e94] focus:border-[#78916c] focus:ring-2 focus:ring-[#31573a]/15 sm:text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={menuLoading || !cartItemsAreAvailable || submitting}
            className="mt-6 hidden min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#31573a] px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#25472e] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 sm:inline-flex"
          >
            {submitting ? "Creating your order..." : "Continue to Payment"}
            {!submitting && <ArrowRight size={17} aria-hidden="true" />}
          </button>
          {menuLoading && (
            <p role="status" className="mt-3 text-center text-xs text-[#73796d]">
              Checking that your items are available...
            </p>
          )}
          {!menuLoading && menuError && (
            <div role="alert" className="mt-3 text-sm text-[#984734]">
              {menuError}{" "}
              <button type="button" onClick={() => void refreshMenu()} className="font-semibold underline">
                Try again
              </button>
            </div>
          )}
          {!menuLoading && !menuError && cart.length > 0 && !cartItemsAreAvailable && (
            <p role="alert" className="mt-3 text-sm text-[#984734]">
              One or more cart items are unavailable. Please review your cart.
            </p>
          )}
        </form>

        <aside
          aria-labelledby="checkout-summary-heading"
          className="rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-[0_12px_36px_-28px_rgba(30,51,35,0.4)] lg:sticky lg:top-24 sm:p-6"
        >
          <h2
            id="checkout-summary-heading"
            className="font-serif text-xl font-semibold text-[#253b2a] sm:text-2xl"
          >
            Your order
          </h2>
          <p className="mt-1 text-sm text-[#73796d]">
            {cartCount} {cartCount === 1 ? "item" : "items"}
          </p>
          <ul className="mt-5 max-h-64 space-y-3 overflow-y-auto border-b border-[#eeece4] pb-5">
            {checkoutItems.map((item) => (
              <li
                key={`${item.id}-${item.size}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#394b38]">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7a8074]">
                    {item.size} · Qty {item.quantity}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-[#394b38]">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-semibold text-[#253b2a]">Total</span>
            <span className="text-2xl font-bold tabular-nums text-[#253b2a]">
              {formatPrice(currentCartTotal)}
            </span>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#f5f5ef] p-3 text-xs leading-5 text-[#73796d]">
            <Clock3
              size={15}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#658160]"
            />
            Your final payable amount will be confirmed using current menu
            prices on the payment page.
          </div>
        </aside>
      </div>

      <div
        className="fixed inset-x-0 z-40 border-t border-[#e9e6da] bg-[#fffdf7]/95 px-4 pt-3 shadow-[0_-12px_32px_-24px_rgba(36,49,34,0.65)] backdrop-blur-lg sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="submit"
          form="checkout-form"
          disabled={menuLoading || !cartItemsAreAvailable || submitting}
          className="mx-auto flex min-h-12 w-full max-w-lg items-center justify-between gap-3 rounded-full bg-[#31573a] px-5 font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
        >
          <span className="inline-flex items-center gap-2">
            {submitting ? "Creating your order..." : "Continue to Payment"}
            {!submitting && <ArrowRight size={17} aria-hidden="true" />}
          </span>
          <span className="tabular-nums">{formatPrice(currentCartTotal)}</span>
        </button>
      </div>
    </div>
  );
}
