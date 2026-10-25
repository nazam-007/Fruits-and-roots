
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";

import { useMenu } from "../../context/MenuContext";
import { useCart } from "../../context/CartContext";
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
    <div className="mx-auto max-w-5xl pb-24">
      <Link
        to="/menu"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#354632]"
      >
        <ArrowLeft size={18} />
        Back to Menu
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-[#E8EDDF]">
          <MenuItemImage
            item={product}
            imageClassName="absolute inset-0 h-full w-full object-cover"
            fallbackClassName="absolute inset-0 flex items-center justify-center text-8xl"
          />
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
            {product.category}
          </p>

          <h1 className="mt-3 text-3xl font-bold text-[#354632] sm:text-4xl">
            {product.name}
          </h1>

          <p className="mt-4 text-gray-600">
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
              <h2 className="mt-8 font-semibold text-[#354632]">
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
                    className={`rounded-xl border px-5 py-3 text-sm font-semibold transition ${
                      activeVariant.size === variant.size
                        ? "border-[#354632] bg-[#354632] text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {variant.size} — ₹{variant.price}
                  </button>
                ))}
              </div>

              <h2 className="mt-8 font-semibold text-[#354632]">
                Quantity
              </h2>

              <div className="mt-3 inline-flex w-fit items-center rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((q) => Math.max(1, q - 1))
                  }
                  disabled={quantity <= 1}
                  className="px-5 py-3 disabled:opacity-40"
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
                  className="px-5 py-3"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <div className="mt-10 flex items-center justify-between">
                <span className="text-gray-500">Total</span>
                <span className="text-3xl font-bold text-[#354632]">
                  ₹{total}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="mt-5 inline-flex items-center justify-center gap-3 rounded-2xl bg-[#354632] px-6 py-4 font-semibold text-white hover:bg-[#263524]"
              >
                <ShoppingCart size={20} />
                Add to Cart
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
