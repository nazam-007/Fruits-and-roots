
import { Link } from "react-router-dom";
import { ArrowUpRight, Leaf } from "lucide-react";
import type { MenuItem } from "../../data/menu";

type ProductCardProps = {
  item: MenuItem;
};

export default function ProductCard({
  item,
}: ProductCardProps) {
  const regularPrice = item.variants.find(
    (variant) => variant.size === "Regular"
  )?.price;

  const startingPrice =
    regularPrice ??
    (item.variants.length > 0
      ? Math.min(...item.variants.map((v) => v.price))
      : null);

  const isAvailable =
    item.available && item.variants.length > 0;

  const productImage = item.image?.trim();

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Product image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[#E8EDDF]">
        {productImage ? (
          <img
            src={productImage}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#E8EDDF] to-[#F7F1DF]">
            <span className="text-6xl" aria-hidden="true">
              {item.category === "Fruitopia"
                ? "🍓"
                : item.category === "Guilty Pleasures"
                  ? "🧇"
                  : item.category === "Bread & Bite"
                    ? "🥪"
                    : "🥤"}
            </span>
            <span className="text-xs font-medium text-[#607158]">
              Freshly made
            </span>
          </div>
        )}

        {/* Featured badge */}
        {item.featured && isAvailable && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#354632] shadow-sm">
            <Leaf size={13} />
            Popular
          </span>
        )}

        {/* Coming soon overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#354632]">
              Coming Soon
            </span>
          </div>
        )}
      </div>

      {/* Product information */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#71816C]">
          {item.category}
        </p>

        <h3 className="mb-3 line-clamp-2 min-h-12 text-lg font-bold leading-snug text-[#354632]">
          {item.name}
        </h3>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div>
            {isAvailable && startingPrice !== null ? (
              <>
                <p className="text-xs text-gray-500">
                  Starting from
                </p>
                <p className="text-xl font-bold text-[#354632]">
                  ₹{startingPrice}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-orange-700">
                Available soon
              </p>
            )}
          </div>

          {isAvailable ? (
            <Link
              to={`/product/${encodeURIComponent(item.id)}`}
              aria-label={`View ${item.name}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#354632] text-white transition-colors hover:bg-[#263524] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#354632]"
            >
              <ArrowUpRight size={21} />
            </Link>
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <ArrowUpRight size={21} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
