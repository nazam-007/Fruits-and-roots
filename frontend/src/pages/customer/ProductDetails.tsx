
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";

import { useMenu } from "../../context/MenuContext";
import { useCart } from "../../context/useCart";
import MenuItemImage from "../../components/customer/MenuItemImage";

type Size = "Regular" | "Large";

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { menuItems, loading, error, refreshMenu } = useMenu();
  const { addToCart } = useCart();

  const product = useMemo(
    () => menuItems.find((item) => item.id === id),
    [menuItems, id]
  );

  const [selectedSize, setSelectedSize] =
    useState<Size>("Regular");
  const [quantity, setQuantity] = useState(1);

  if (loading) {
    return (
      <div role="status" className="py-20 text-center">
        Loading product details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p role="alert">{error}</p>
        <button
          type="button"
          onClick={() => void refreshMenu()}
          className="mt-4 rounded-xl bg-[#354632] px-6 py-3 text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">
          Product not found
        </h1>
        <Link
          to="/menu"
          className="mt-5 inline-block text-green-800 underline"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const availableVariants = product.variants;
  const activeVariant =
    availableVariants.find((v) => v.size === selectedSize) ??
    availableVariants[0];

  const isAvailable =
    product.available && Boolean(activeVariant);

  const total = (activeVariant?.price ?? 0) * quantity;

  const handleAddToCart = () => {
    if (!activeVariant || !isAvailable) return;

    addToCart({
      id: product.id,
      name: product.name,
      size: activeVariant.size,
      price: activeVariant.price,
      quantity,
    });
    navigate("/cart");
  };

  return (
    <div className="mx-auto max-w-5xl pb-28 sm:pb-8">
      <Link
        to="/menu"
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#354632] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
      >
        <ArrowLeft size={18} />
        Back to Menu
      </Link>

      <div className="grid gap-5 sm:gap-8 md:grid-cols-2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-[#E8EDDF] sm:aspect-square">
          <MenuItemImage
            item={product}
            imageClassName="absolute inset-0 h-full w-full object-cover"
            fallbackClassName="absolute inset-0 flex items-center justify-center text-8xl"
          />
        </div>

        <div className="min-w-0 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b56b36]">
            {product.category}
          </p>

          <h1 className="mt-2 break-words font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:mt-3 sm:text-4xl">
            {product.name}
          </h1>

          {product.tags && product.tags.length > 0 && (
            <ul aria-label="Product tags" className="mt-4 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <li
                  key={tag}
                  className="max-w-full break-words rounded-full bg-[#fff7e9] px-3 py-1 text-xs font-semibold text-[#8d562e]"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-sm leading-6 text-[#73796d] sm:mt-4 sm:text-base">
            {product.description || "Freshly prepared with care at Fruits & Roots."}
          </p>

          {!isAvailable ? (
            <p className="mt-8 font-semibold text-orange-700">
              {product.availabilityStatus === "SOLD_OUT"
                ? "Sold Out"
                : product.availabilityStatus === "COMING_SOON"
                  ? "Coming Soon"
                  : "Price not set yet"}
            </p>
          ) : (
            <>
              <h2 className="mt-5 font-semibold text-[#354632] sm:mt-8">
                Choose your size
              </h2>

              <div className="mt-3 flex flex-wrap gap-3">
                {availableVariants.map((variant) => (
                  <button
                    key={variant.size}
                    type="button"
                    onClick={() =>
                      setSelectedSize(variant.size)
                    }
                    aria-pressed={
                      activeVariant.size === variant.size
                    }
                    className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] ${
                      activeVariant.size === variant.size
                        ? "border-[#354632] bg-[#354632] text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {variant.size} — ₹{variant.price}
                  </button>
                ))}
              </div>

              <h2 className="mt-5 font-semibold text-[#354632] sm:mt-8">
                Quantity
              </h2>

              <div className="mt-3 inline-flex w-fit items-center rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.max(1, q - 1))
                  }
                  disabled={quantity <= 1}
                  className="flex h-11 w-11 items-center justify-center disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  −
                </button>

                <span className="min-w-10 text-center font-semibold">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="flex h-11 w-11 items-center justify-center"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <div className="mt-6 flex items-center justify-between sm:mt-10">
                <span className="text-gray-500">Total</span>
                <span className="text-3xl font-bold text-[#354632]">
                  ₹{total}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="mt-5 hidden min-h-12 items-center justify-center gap-3 rounded-2xl bg-[#354632] px-6 font-semibold text-white transition hover:bg-[#263524] active:scale-[0.99] sm:inline-flex"
              >
                <ShoppingCart size={20} />
                Add to Cart
              </button>
            </>
          )}
        </div>
      </div>
      {isAvailable && (
        <div
          className="mobile-sticky-action fixed inset-x-0 z-40 border-t border-[#e9e6da] bg-[#fffdf7]/95 px-4 pt-3 shadow-[0_-12px_32px_-24px_rgba(36,49,34,0.65)] backdrop-blur-lg sm:hidden"
          style={{ bottom: "var(--customer-mobile-nav-offset)" }}
        >
          <button
            type="button"
            onClick={handleAddToCart}
            className="mx-auto flex min-h-12 w-full max-w-lg items-center justify-between gap-3 rounded-full bg-[#31573a] px-5 font-semibold text-white transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingCart size={17} aria-hidden="true" />
              Add to Cart
            </span>
            <span className="tabular-nums">₹{total}</span>
          </button>
        </div>
      )}
    </div>
  );
}
