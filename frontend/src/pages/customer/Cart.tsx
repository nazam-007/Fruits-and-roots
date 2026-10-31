import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useCart } from "../../context/useCart";
import { useMenu } from "../../context/MenuContext";
import MenuItemImage from "../../components/customer/MenuItemImage";

const formatPrice = (price: number) => `₹${price.toLocaleString("en-IN")}`;

export default function Cart() {
  const navigate = useNavigate();
  const { cart, cartCount, updateQuantity, removeFromCart } =
    useCart();
  const {
    menuItems,
    loading: menuLoading,
    error: menuError,
    refreshMenu,
  } = useMenu();
  const cartEntries = cart.map((item) => {
    const product = menuItems.find((menuItem) => menuItem.id === item.id);
    const variant = product?.variants.find((menuVariant) => menuVariant.size === item.size);
    const available = product?.available === true && Boolean(variant);
    return {
      ...item,
      product,
      name: product?.name ?? item.name,
      price: variant?.price ?? item.price,
      available,
      statusLabel: menuLoading || menuError
        ? null
        : !product
        ? "No longer on the menu"
        : product.availabilityStatus === "SOLD_OUT"
          ? "Sold out"
          : product.availabilityStatus === "COMING_SOON" || !product.available
            ? "Coming soon"
            : variant
              ? null
              : "This size is no longer offered",
    };
  });
  const currentCartTotal = cartEntries.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
  const cartItemsAreAvailable =
    !menuLoading && !menuError && cartEntries.every((item) => item.available);

  if (cart.length === 0) {
    return (
      <section className="mx-auto max-w-xl rounded-[2rem] border border-[#e7e4d8] bg-white px-6 py-14 text-center shadow-[0_20px_65px_-48px_rgba(36,51,37,0.5)] sm:px-12 sm:py-16">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#edf1e6] text-[#31573a]">
          <ShoppingBag size={34} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
          Something fresh is calling
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
          Your bag is taking a break
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#73796d] sm:text-base">
          It’s looking a little empty in here. Find a fresh favorite and we’ll
          get it ready for you.
        </p>
        <Link
          to="/menu"
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#31573a] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#25472e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
        >
          Explore the menu
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-24 sm:pb-0">
      <Link
        to="/menu"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-semibold text-[#596554] transition hover:text-[#31573a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e2d6] bg-white">
          <ArrowLeft size={17} aria-hidden="true" />
        </span>
        Keep browsing
      </Link>

      <div className="mb-6 flex items-end justify-between gap-3 sm:mb-8">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
            Your fresh picks
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
            Your bag
          </h1>
        </div>
        <p className="mb-1 rounded-full bg-[#edf1e6] px-3 py-1.5 text-xs font-semibold text-[#31573a] sm:text-sm">
          {cartCount} {cartCount === 1 ? "item" : "items"}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <section
          aria-label="Cart items"
          className="min-w-0 space-y-3 sm:space-y-4"
        >
          {cartEntries.map((item) => {
            const quantityReachedLimit = item.quantity >= 99;

            return (
              <article
                key={`${item.id}-${item.size}`}
                className="flex min-w-0 gap-3 rounded-2xl border border-[#e7e4d8] bg-white p-3 shadow-[0_8px_26px_-20px_rgba(30,51,35,0.55)] sm:gap-5 sm:rounded-3xl sm:p-5"
              >
                <Link
                  to={`/product/${item.id}`}
                  aria-label={`View ${item.name}`}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#e9eddf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] sm:h-28 sm:w-28 sm:rounded-2xl"
                >
                  {item.product ? (
                    <MenuItemImage
                      item={item.product}
                      width={450}
                      height={450}
                      imageClassName="absolute inset-0 h-full w-full object-cover transition duration-300 hover:scale-105"
                      fallbackClassName="absolute inset-0 flex items-center justify-center text-4xl"
                    />
                  ) : (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-4xl">🥤</span>
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-[#253b2a] sm:text-lg">
                        {item.name}
                      </h2>
                      <p className="mt-1 text-xs font-medium text-[#7a8074] sm:text-sm">
                        {item.size} size
                      </p>
                        {item.statusLabel && (
                          <p className="mt-1 text-xs font-semibold text-[#984734]" role="alert">
                            {item.statusLabel}
                          </p>
                        )}
                      <p className="mt-1 text-xs text-[#73796d] sm:text-sm">
                        {formatPrice(item.price)} each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id, item.size)}
                      aria-label={`Remove ${item.name}, ${item.size} size`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#888d81] transition hover:bg-[#fff0eb] hover:text-[#b14e37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                    <div
                      role="group"
                      className="inline-flex h-12 items-center rounded-full border border-[#e5e2d6] bg-[#fbfbf7] p-0.5"
                      aria-label={`${item.name} quantity`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            item.size,
                            item.quantity - 1,
                          )
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-full text-[#31573a] transition hover:bg-[#edf1e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
                        aria-label={`Decrease ${item.name} quantity`}
                      >
                        <Minus size={15} aria-hidden="true" />
                      </button>
                      <output
                        aria-live="polite"
                        aria-label={`${item.name} quantity`}
                        className="min-w-7 text-center text-xs font-semibold tabular-nums text-[#253b2a] sm:text-sm"
                      >
                        {item.quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            item.size,
                            item.quantity + 1,
                          )
                        }
                        disabled={quantityReachedLimit}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-[#31573a] transition hover:bg-[#edf1e6] disabled:cursor-not-allowed disabled:text-[#b5b9b0] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
                        aria-label={`Increase ${item.name} quantity`}
                      >
                        <Plus size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <p className="pb-1 text-sm font-bold tabular-nums text-[#253b2a] sm:text-base">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside
          aria-labelledby="order-summary-heading"
          className="min-w-0 rounded-3xl border border-[#e7e4d8] bg-white p-5 shadow-[0_12px_36px_-28px_rgba(30,51,35,0.4)] sm:p-6 lg:sticky lg:top-24"
        >
          <h2
            id="order-summary-heading"
            className="font-serif text-xl font-semibold text-[#253b2a] sm:text-2xl"
          >
            Order summary
          </h2>

          <div className="mt-5 space-y-3 border-b border-[#eeece4] pb-5 text-sm">
            <div className="flex justify-between gap-3 text-[#73796d]">
              <span>Items ({cartCount})</span>
              <span className="font-medium tabular-nums text-[#253b2a]">
                {formatPrice(currentCartTotal)}
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-5 text-[#7a8074]">
              <Clock3
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-[#658160]"
              />
              Payment instructions are shown at checkout. Your order is
              prepared fresh.
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-semibold text-[#253b2a]">Total</span>
            <output
              aria-label="Cart total"
              aria-live="polite"
              className="text-2xl font-bold tabular-nums text-[#253b2a]"
            >
              {formatPrice(currentCartTotal)}
            </output>
          </div>
          {menuLoading ? (
            <p role="status" className="mt-3 text-center text-xs text-[#73796d]">
              Checking current menu prices and availability…
            </p>
          ) : menuError ? (
            <div role="alert" className="mt-3 rounded-xl bg-[#fff2ee] p-3 text-sm text-[#984734]">
              {menuError}
              <button type="button" onClick={() => void refreshMenu()} className="mt-2 inline-flex min-h-9 items-center gap-2 font-semibold underline">
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          ) : !cartItemsAreAvailable ? (
            <div className="mt-3 rounded-xl bg-[#fff2ee] p-3 text-sm text-[#984734]">
              Remove unavailable items or choose another size before checkout.
              <button type="button" onClick={() => void refreshMenu()} className="mt-2 inline-flex min-h-9 items-center gap-2 font-semibold underline">
                <RefreshCw size={14} /> Refresh menu
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => navigate("/checkout")}
            disabled={menuLoading || !cartItemsAreAvailable}
            className="mt-5 hidden min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#31573a] px-5 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#25472e] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 sm:inline-flex"
          >
            Continue to checkout
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <p className="mt-3 hidden text-center text-xs text-[#858a7e] sm:block">
            Freshly made after you place your order
          </p>
        </aside>
      </div>

      <div
        className="fixed inset-x-0 z-40 border-t border-[#e9e6da] bg-[#fffdf7]/95 px-4 pt-3 shadow-[0_-12px_32px_-24px_rgba(36,49,34,0.65)] backdrop-blur-lg sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => navigate("/checkout")}
          disabled={menuLoading || !cartItemsAreAvailable}
          className="mx-auto flex min-h-12 w-full max-w-lg items-center justify-between gap-3 rounded-full bg-[#31573a] px-5 font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
        >
          <span className="inline-flex items-center gap-2">
            Continue to checkout
            <ArrowRight size={17} aria-hidden="true" />
          </span>
          <span className="tabular-nums">{formatPrice(currentCartTotal)}</span>
        </button>
      </div>
    </div>
  );
}
