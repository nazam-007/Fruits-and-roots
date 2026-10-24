
import { useMemo, useState } from "react";
import { Search, RefreshCw, UtensilsCrossed } from "lucide-react";

import ProductCard from "../../components/customer/ProductCard";
import { categories } from "../../data/menu";
import { useMenu } from "../../context/MenuContext";

export default function Menu() {
  const { menuItems, loading, error, refreshMenu } = useMenu();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());

      const matchesCategory =
        activeCategory === "All" ||
        item.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, activeCategory]);
  const menuCategories = useMemo(
    () => [...new Set(menuItems.map((item) => item.category))].sort(),
    [menuItems],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-24">
      {/* Page header */}
      <section className="space-y-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
          Freshly prepared for you
        </p>

        <h1 className="text-3xl font-bold text-[#354632] sm:text-4xl">
          Explore Our Menu
        </h1>

        <p className="mx-auto max-w-xl text-gray-600">
          Discover fresh juices, delicious fruit bowls,
          indulgent desserts, and satisfying bites.
        </p>
      </section>

      {/* Search */}
      <div className="relative mx-auto max-w-2xl">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
          type="search"
          value={searchQuery}
          onChange={(event) =>
            setSearchQuery(event.target.value)
          }
          placeholder="Search juices, fruits, desserts..."
          aria-label="Search menu items"
          className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 outline-none transition focus:border-[#354632] focus:ring-2 focus:ring-green-100"
        />
      </div>

      {/* Category filters */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-gray-100 bg-[#FAF8F2]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl gap-3 overflow-x-auto pb-1">
          {["All", ...new Set([...categories, ...menuCategories])].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              aria-pressed={activeCategory === category}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                activeCategory === category
                  ? "bg-[#354632] text-white shadow-md"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-[#354632] hover:text-[#354632]"
              }`}
            >
              {category === "All" ? "All Items" : category}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div
          role="status"
          aria-label="Loading menu"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
            >
              <div className="aspect-[4/3] animate-pulse bg-gray-200" />

              <div className="space-y-3 p-4">
                <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                <div className="h-6 w-1/3 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading delicious items...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          role="alert"
          className="mx-auto max-w-lg rounded-2xl border border-red-100 bg-white px-6 py-12 text-center shadow-sm"
        >
          <RefreshCw
            size={36}
            className="mx-auto mb-4 text-red-500"
          />

          <h2 className="text-xl font-semibold text-gray-900">
            Unable to load menu
          </h2>

          <p className="mt-2 text-gray-500">{error}</p>

          <button
            type="button"
            onClick={() => void refreshMenu()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#354632] px-6 py-3 font-semibold text-white transition hover:bg-[#263524]"
          >
            <RefreshCw size={17} />
            Try Again
          </button>
        </div>
      )}

      {/* Product grid */}
      {!loading && !error && filteredItems.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-[#354632]">
                {filteredItems.length}
              </span>{" "}
              items
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Empty search results */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="py-20 text-center">
          <UtensilsCrossed
            size={48}
            className="mx-auto mb-4 text-gray-400"
          />

          <h2 className="text-xl font-semibold text-[#354632]">
            No items found
          </h2>

          <p className="mt-2 text-gray-500">
            Try another search or choose a different category.
          </p>

          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("All");
            }}
            className="mt-5 rounded-xl bg-[#354632] px-6 py-3 font-medium text-white"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
