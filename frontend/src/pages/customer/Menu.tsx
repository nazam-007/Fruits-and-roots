
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, RefreshCw, UtensilsCrossed } from "lucide-react";

import ProductCard from "../../components/customer/ProductCard";
import { useMenu } from "../../context/MenuContext";
import { getCategorySlug } from "../../data/menu";

export default function Menu() {
  const {
    menuItems,
    loading,
    error,
    refreshMenu,
    restaurantStatus,
    restaurantStatusLoading,
    restaurantStatusError,
  } = useMenu();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const menuCategories = useMemo(
    () => {
      const seen = new Set<string>();
      return menuItems.reduce<Array<{ id: string; name: string }>>(
        (result, item) => {
          if (!item.category) return result;
          const id = item.categoryId ?? `category-name:${item.category}`;
          if (!seen.has(id)) {
            seen.add(id);
            result.push({ id, name: item.category });
          }
          return result;
        },
        [],
      );
    },
    [menuItems],
  );
  const acceptingOrders =
    restaurantStatus?.orderingAvailable === true && !restaurantStatusError;
  const ordersPaused =
    restaurantStatus?.status === "PAUSED" && !restaurantStatusError;
  const ordersClosed =
    restaurantStatus?.status === "CLOSED" && !restaurantStatusError;
  const nextOpening = restaurantStatus?.nextOpenAt
    ? new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(restaurantStatus.nextOpenAt))
    : null;
  const requestedCategory = searchParams.get("category");
  const selectedCategoryId =
    menuCategories.find(
      (category) =>
        category.id === requestedCategory ||
        getCategorySlug(category.name) === requestedCategory,
    )?.id ?? null;
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());

      const itemCategoryId = item.categoryId ?? `category-name:${item.category}`;
      const matchesCategory =
        selectedCategoryId === null || itemCategoryId === selectedCategoryId;

      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, selectedCategoryId]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24 sm:space-y-8">
      {/* Page header */}
      <section className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b56b36]">
          Freshly prepared for you
        </p>

        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl">
          Explore Our Menu
        </h1>

        <p className="max-w-xl text-sm leading-6 text-[#73796d] sm:text-base">
          Discover fresh juices, delicious fruit bowls,
          indulgent desserts, and satisfying bites.
        </p>
      </section>

      <div
        role="status"
        aria-live="polite"
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:px-4 sm:text-sm ${
          acceptingOrders
            ? "border-green-200 bg-green-50 text-green-900"
            : ordersPaused
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-gray-200 bg-white text-gray-600"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            acceptingOrders
              ? "bg-green-600"
              : ordersPaused
                ? "bg-amber-600"
                : "bg-gray-400"
          }`}
        />
        {restaurantStatusError
          ? "Order availability is temporarily unavailable"
          : restaurantStatusLoading && !restaurantStatus
          ? "Checking order availability..."
          : acceptingOrders
            ? "Open Now"
            : ordersClosed
              ? "Closed Now"
              : ordersPaused
                ? "Temporarily Not Accepting Orders"
                : "Order availability is temporarily unavailable"}
      </div>
      {ordersClosed && nextOpening && (
        <p className="-mt-3 text-sm text-gray-600">
          Opens next: {nextOpening} IST
        </p>
      )}

      {/* Search */}
      <div className="relative max-w-2xl">
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
          className="min-h-12 w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-base outline-none transition focus:border-[#354632] focus:ring-2 focus:ring-green-100"
        />
      </div>

      {/* Category filters */}
      <div className="sticky top-[var(--customer-header-offset)] z-30 -mx-4 border-b border-gray-100 bg-[#FAF8F2]/95 px-4 py-2 backdrop-blur-md sm:py-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: null, name: "All" }, ...menuCategories].map((category) => (
            <button
              key={category.id ?? "all"}
              type="button"
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                if (category.id === null) {
                  nextParams.delete("category");
                } else {
                  nextParams.set("category", getCategorySlug(category.name));
                }
                setSearchParams(nextParams, { replace: true });
              }}
              aria-pressed={selectedCategoryId === category.id}
              className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold transition-all duration-200 sm:px-5 sm:text-sm ${
                selectedCategoryId === category.id
                  ? "bg-[#354632] text-white shadow-md"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-[#354632] hover:text-[#354632]"
              }`}
            >
              {category.id === null ? "All Items" : category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div
          role="status"
          aria-label="Loading menu"
          className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4"
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
            >
              <div className="aspect-[3/2] animate-pulse bg-gray-200 sm:aspect-[4/3]" />

              <div className="space-y-3 p-2 sm:p-4">
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

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item, index) => (
              <ProductCard
                key={item.id}
                item={item}
                imageLoading={index < 2 ? "eager" : "lazy"}
              />
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
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete("category");
              setSearchParams(nextParams, { replace: true });
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
