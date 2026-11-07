import { memo, useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { useCartActions } from "../../context/useCart";
import type { MenuItem, MenuVariant } from "../../data/menu";
import MenuItemImage from "./MenuItemImage";

type Props = {
  item: MenuItem;
  imageLoading?: "eager" | "lazy";
};

function getDefaultVariant(item: MenuItem): MenuVariant | undefined {
  return (
    item.variants.find((variant) => variant.size === "Regular") ??
    item.variants[0]
  );
}

function ProductCard({ item, imageLoading = "lazy" }: Props) {
  const { addToCart } = useCartActions();
  const sizeDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedSize, setSelectedSize] = useState(
    () => getDefaultVariant(item)?.size,
  );
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const selectedVariant = item.variants.find(
    (variant) => variant.size === selectedSize,
  );
  const available = item.available && item.variants.length > 0;
  const startingPrice = item.variants.length
    ? Math.min(...item.variants.map((variant) => variant.price))
    : null;
  const assignedTags = item.tags ?? [];
  const visibleTags = assignedTags
    .filter((tag) => !item.featured || tag.toLowerCase() !== "featured")
    .slice(0, 2);

  useEffect(() => {
    if (!added) return;
    const timeoutId = window.setTimeout(() => setAdded(false), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [added]);

  useEffect(() => {
    const dialog = sizeDialogRef.current;
    if (!dialog) return;

    if (sizeDialogOpen && !dialog.open) {
      dialog.showModal();
    } else if (!sizeDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [sizeDialogOpen]);

  const addVariantToCart = (variant: MenuVariant | undefined) => {
    if (!item.available || !variant) return;
    addToCart({
      id: item.id,
      name: item.name,
      size: variant.size,
      price: variant.price,
      quantity: 1,
    });
    setAdded(true);
  };

  const handleAdd = () => {
    if (!available) return;
    if (item.variants.length > 1) {
      setSelectedSize(getDefaultVariant(item)?.size);
      setSizeDialogOpen(true);
      return;
    }
    addVariantToCart(item.variants[0]);
  };

  const handleConfirmSize = () => {
    addVariantToCart(selectedVariant);
    setSizeDialogOpen(false);
  };

  return (
    <article className="menu-product-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7e4d8] bg-white shadow-[0_8px_26px_-20px_rgba(30,51,35,0.55)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-22px_rgba(30,51,35,0.35)] sm:rounded-3xl">
      <Link
        to={`/product/${encodeURIComponent(item.id)}`}
        aria-label={`View ${item.name}`}
        className="group relative block aspect-[3/2] overflow-hidden bg-[#e9eddf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b56b36] sm:aspect-[4/3]"
      >
        <MenuItemImage
          item={item}
          width={600}
          height={450}
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, calc(50vw - 1.375rem)"
          loading={imageLoading}
          imageClassName="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          fallbackClassName="absolute inset-0 flex items-center justify-center text-5xl text-[#31573a]"
        />
        {(item.featured || visibleTags.length > 0 || !available) && (
          <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1.5 sm:inset-x-3 sm:top-3">
            {item.featured && (
              <span className="max-w-full truncate rounded-full bg-[#fff7e9]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8d562e] shadow-sm">
                Featured
              </span>
            )}
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="max-w-[calc(100%-0.5rem)] truncate rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#354632] shadow-sm"
              >
                {tag}
              </span>
            ))}
            {!available && (
              <span className="rounded-full bg-[#253b2a]/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                {item.availabilityStatus === "SOLD_OUT"
                  ? "Sold out"
                  : item.availabilityStatus === "COMING_SOON"
                    ? "Coming soon"
                    : "Unavailable"}
              </span>
            )}
          </div>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-4">
        <div className="min-w-0">
          <Link
            to={`/product/${encodeURIComponent(item.id)}`}
            className="line-clamp-2 min-h-10 break-words text-sm font-semibold leading-5 text-[#253b2a] [overflow-wrap:anywhere] hover:text-[#31573a] focus-visible:outline-none focus-visible:underline sm:text-base"
          >
            {item.name}
          </Link>
          <p
            aria-label={
              item.variants.length > 1 ? "Starting price" : "Price"
            }
            className={`mt-1 flex min-h-7 items-center gap-1 leading-6 ${
              startingPrice !== null
                ? "text-lg font-semibold text-[#31573a]"
                : "text-xs text-[#73796d]"
            }`}
          >
            {startingPrice !== null
              ? (
                  <>
                    {item.variants.length > 1 && (
                      <span className="text-sm font-medium">From</span>
                    )}
                    <span className="font-bold tabular-nums">
                      ₹{startingPrice}
                    </span>
                  </>
                )
              : item.availabilityStatus === "COMING_SOON"
                ? "Coming soon"
                : "Price not set"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!available}
          aria-label={added ? `${item.name} added to cart` : `Add ${item.name} to cart`}
          className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#31573a] px-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#25472e] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#eceee8] disabled:text-[#7a8074] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 sm:text-sm"
        >
          {added ? (
            <>
              <Check size={15} aria-hidden="true" />
              Added
            </>
          ) : available ? (
            <>
              <Plus size={15} aria-hidden="true" />
              Add
            </>
          ) : (
            "Unavailable"
          )}
        </button>
      </div>

      {item.variants.length > 1 && (
        <dialog
          ref={sizeDialogRef}
          aria-labelledby={`size-dialog-title-${item.id}`}
          onClose={() => setSizeDialogOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSizeDialogOpen(false);
            }
          }}
          className="product-size-dialog fixed inset-x-0 top-auto bottom-0 m-0 max-h-[min(85dvh,32rem)] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-[#faf9f4] p-0 text-[#253b2a] shadow-[0_-16px_50px_-24px_rgba(20,35,23,0.35)] backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-md sm:rounded-3xl"
        >
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#d6d9ce] sm:hidden" />
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b56b36]">
                  Choose a size
                </p>
                <h2
                  id={`size-dialog-title-${item.id}`}
                  className="mt-1 break-words font-serif text-xl font-semibold text-[#253b2a]"
                >
                  {item.name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close size selection"
                onClick={() => setSizeDialogOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#596554] transition hover:bg-[#edf1e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
              >
                ×
              </button>
            </div>

            <div
              role="group"
              aria-label={`Available sizes for ${item.name}`}
              className="mt-5 grid gap-2"
            >
              {item.variants.map((variant) => (
                <button
                  key={variant.size}
                  type="button"
                  aria-pressed={selectedSize === variant.size}
                  onClick={() => setSelectedSize(variant.size)}
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] ${
                    selectedSize === variant.size
                      ? "border-[#31573a] bg-[#edf1e6] text-[#31573a]"
                      : "border-[#e7e4d8] bg-white text-[#596554] hover:border-[#9aaa91]"
                  }`}
                >
                  <span>{variant.size}</span>
                  <span className="tabular-nums">₹{variant.price}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleConfirmSize}
              disabled={!selectedVariant}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#31573a] px-5 font-semibold text-white transition-colors hover:bg-[#25472e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add {selectedVariant ? `· ₹${selectedVariant.price}` : "to cart"}
            </button>
          </div>
        </dialog>
      )}
    </article>
  );
}

export default memo(ProductCard);
