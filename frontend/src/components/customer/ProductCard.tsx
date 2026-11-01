
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { MenuItem } from "../../data/menu";
import MenuItemImage from "./MenuItemImage";

type Props = {
  item: MenuItem;
};

export default function ProductCard({ item }: Props) {
  const startingPrice = item.variants.length
    ? Math.min(...item.variants.map((v) => v.price))
    : null;
  const availabilityLabel =
    item.availabilityStatus === "SOLD_OUT"
      ? "Sold Out"
      : item.availabilityStatus === "COMING_SOON"
        ? "Coming Soon"
        : "Price Not Set";
  return (
    <article className="group h-full overflow-hidden rounded-2xl border border-[#e7e4d8] bg-white shadow-[0_8px_26px_-20px_rgba(30,51,35,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_-20px_rgba(30,51,35,0.35)] sm:rounded-3xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#e9eddf]">
        <MenuItemImage
          item={item}
          width={900}
          height={675}
          imageClassName="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallbackClassName="absolute inset-0 flex items-center justify-center text-5xl text-[#31573a]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {item.featured && (
            <span className="rounded-full bg-[#fff7e9]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8d562e] shadow-sm sm:text-[11px]">
              Featured
            </span>
          )}
          {!item.available && (
            <span className="rounded-full bg-[#253b2a]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-sm sm:text-[11px]">
              {availabilityLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-[104px] items-center justify-between gap-2 p-3.5 sm:min-h-[116px] sm:p-5">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[#253b2a] sm:text-lg">
            {item.name}
          </h3>
          {item.availabilityStatus !== "SOLD_OUT" && (
            <p className="mt-1 text-xs text-[#7a8074] sm:text-sm">
              {startingPrice !== null
                ? (
                    <>
                      From{" "}
                      <span className="font-semibold text-[#31573a]">
                        ₹{startingPrice}
                      </span>
                    </>
                  )
                : item.availabilityStatus === "COMING_SOON"
                  ? "Coming Soon"
                  : "Price not set"}
            </p>
          )}
        </div>

        <Link
          to={`/product/${item.id}`}
          aria-label={`View ${item.name}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#edf1e6] text-[#31573a] transition-colors hover:bg-[#31573a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2"
        >
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
