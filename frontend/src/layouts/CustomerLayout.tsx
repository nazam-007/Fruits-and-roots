import {
  House,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  ShoppingBag,
} from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useCart } from "../context/useCart";

const directionsUrl =
  "https://www.google.com/maps/search/?api=1&query=H76V%2BJ22%2C%20New%20Delhi";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-2 ${
    isActive
      ? "bg-[#e9eddf] text-[#253b2a]"
      : "text-[#626c5e] hover:bg-[#f1f0e9] hover:text-[#253b2a]"
  }`;

export default function CustomerLayout() {
  const { cartCount } = useCart();

  return (
    <div className="min-h-screen bg-[#faf9f4] text-[#253b2a]">
      <header className="sticky top-0 z-50 border-b border-[#e9e6da]/80 bg-[#faf9f4]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link
            to="/"
            aria-label="Fruits & Roots home"
            className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-4"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#31573a] text-[#f9f5e8]">
              <Leaf size={19} aria-hidden="true" />
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight text-[#253b2a] sm:text-xl">
              Fruits <span className="text-[#b56b36]">&</span> Roots
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/menu" className={navLinkClass}>
              Menu
            </NavLink>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={navLinkClass({ isActive: false })}>
              Visit
            </a>
            <NavLink
              to="/cart"
              aria-label={`Shopping bag, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className={({ isActive }) =>
                `${navLinkClass({ isActive })} relative ml-1 !px-3`
              }
            >
              <ShoppingBag size={18} aria-hidden="true" />
              <span className="hidden md:inline">Bag</span>
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d97742] px-1 text-[10px] font-bold leading-none text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 sm:py-7 sm:pb-10 lg:px-10">
        <Outlet />
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e9e6da] bg-[#fffdf7]/95 px-3 pt-2 shadow-[0_-10px_30px_-24px_rgba(36,49,34,0.6)] backdrop-blur-lg sm:hidden"
        style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] ${
                isActive ? "text-[#31573a]" : "text-[#7a8074]"
              }`
            }
          >
            <House size={19} aria-hidden="true" />
            Home
          </NavLink>
          <NavLink
            to="/menu"
            className={({ isActive }) =>
              `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] ${
                isActive ? "text-[#31573a]" : "text-[#7a8074]"
              }`
            }
          >
            <MenuIcon size={19} aria-hidden="true" />
            Menu
          </NavLink>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-[#7a8074] transition hover:text-[#31573a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
          >
            <MapPin size={19} aria-hidden="true" />
            Visit
          </a>
          <NavLink
            to="/cart"
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            className={({ isActive }) =>
              `relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] ${
                isActive ? "text-[#31573a]" : "text-[#7a8074]"
              }`
            }
          >
            <span className="relative">
              <ShoppingBag size={19} aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d97742] px-1 text-[9px] font-bold leading-none text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            Cart
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
