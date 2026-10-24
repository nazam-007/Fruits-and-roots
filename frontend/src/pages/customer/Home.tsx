import {
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  CupSoda,
  Leaf,
  MapPin,
  ScanLine,
  ShoppingBasket,
} from "lucide-react";
import { Link } from "react-router-dom";
import { categories, getCategorySlug } from "../../data/menu";
import { getMenuItemImage } from "../../data/menuImages";
import { useMenu } from "../../context/MenuContext";

const categoryDetails: Record<
  string,
  { description: string; image: string; accent: string }
> = {
  "Liquid Therapy": {
    description: "Fresh juices, shakes & brews",
    image:
      "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=1000&q=85",
    accent: "from-[#173923]/10 via-[#173923]/25 to-[#173923]/90",
  },
  Fruitopia: {
    description: "Fruit bowls & creamy delights",
    image:
      "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&fit=crop&w=1000&q=85",
    accent: "from-[#173923]/5 via-[#173923]/20 to-[#173923]/90",
  },
  "Guilty Pleasures": {
    description: "Chocolate, waffles & treats",
    image:
      "https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=1000&q=85",
    accent: "from-[#173923]/5 via-[#173923]/20 to-[#173923]/90",
  },
  "Bread & Bite": {
    description: "Toasty sandwiches & bites",
    image:
      "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=1000&q=85",
    accent: "from-[#173923]/5 via-[#173923]/20 to-[#173923]/90",
  },
};

const orderingSteps = [
  {
    title: "Scan the QR",
    description: "Start right from your table. No app or sign-up needed.",
    Icon: ScanLine,
  },
  {
    title: "Choose your favorites",
    description: "Find something fresh, fruity, or a little indulgent.",
    Icon: ShoppingBasket,
  },
  {
    title: "Pay with ease",
    description: "Follow the payment instructions when you check out.",
    Icon: CreditCard,
  },
  {
    title: "Sit back & enjoy",
    description: "We’ll prepare your order fresh and bring it to you.",
    Icon: CupSoda,
  },
];

const directionsUrl =
  "https://www.google.com/maps/search/?api=1&query=H76V%2BJ22%2C%20New%20Delhi";

export default function Home() {
  const { menuItems, loading, error, refreshMenu } = useMenu();
  const featuredItems = menuItems.filter(
    (item) => item.featured && item.available,
  );

  return (
    <>
      <div className="home-page space-y-20 pb-12 md:space-y-28">
        <section className="relative isolate flex min-h-[540px] items-center overflow-hidden rounded-[2rem] bg-[#173923] text-white shadow-[0_24px_70px_-36px_rgba(23,57,35,0.75)] sm:min-h-[600px] lg:min-h-[620px]">
          <img
            src="https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=1800&q=90"
            alt="Freshly blended fruit drinks ready to enjoy"
            width="1800"
            height="1200"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-r from-[#102a1b]/95 via-[#102a1b]/80 to-[#102a1b]/20"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#102a1b]/35 via-transparent to-[#102a1b]/10"
          />

          <div className="max-w-3xl px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold tracking-wide text-[#f8f3df] backdrop-blur-sm">
              <Leaf size={16} aria-hidden="true" />
              Pressed fresh, served with love
            </p>
            <h1 className="max-w-2xl font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Sip the season.
              <span className="mt-1 block text-[#f6a45b]">
                Taste the roots.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/80 sm:text-lg sm:leading-8">
              Fresh juices, fruit bowls, choco waffles and toasties — made
              with care and ordered right from your table.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/menu"
                className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#f6a45b] px-6 py-3 font-semibold text-[#233b27] shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:bg-[#ffb36f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#173923]"
              >
                Explore Menu
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 font-semibold text-white transition duration-200 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#173923]"
              >
                <MapPin size={17} aria-hidden="true" />
                Find us
              </a>
            </div>
          </div>
          <p className="absolute bottom-5 right-6 hidden text-xs font-medium tracking-[0.18em] text-white/65 sm:block">
            GOOD THINGS GROW HERE
          </p>
        </section>

        <section aria-labelledby="categories-heading">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
                A little something for every mood
              </p>
              <h2
                id="categories-heading"
                className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl"
              >
                Pick your mood
              </h2>
            </div>
            <Link
              to="/menu"
              className="hidden min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#31573a] transition hover:bg-[#edf1e6] hover:text-[#b56b36] sm:inline-flex"
            >
              Full menu
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {categories.map((category) => {
              const details = categoryDetails[category];

              return (
                <Link
                  key={category}
                  to={`/menu?category=${getCategorySlug(category)}`}
                  className="group relative isolate flex min-h-52 items-end overflow-hidden rounded-2xl bg-[#31573a] shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-4 sm:min-h-64 sm:rounded-3xl"
                >
                  <img
                    src={details.image}
                    alt=""
                    width="1000"
                    height="1200"
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 -z-10 bg-gradient-to-t ${details.accent}`}
                  />
                  <div className="p-4 text-white sm:p-6">
                    <h3 className="font-serif text-xl font-semibold leading-tight sm:text-2xl">
                      {category}
                    </h3>
                    <p className="mt-1.5 text-xs leading-5 text-white/80 sm:text-sm">
                      {details.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#ffd3a8] transition group-hover:gap-2">
                      Explore
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="featured-heading">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
                Crowd favorites
              </p>
              <h2
                id="featured-heading"
                className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl"
              >
                A few good picks
              </h2>
            </div>
            <Link
              to="/menu"
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[#31573a] transition hover:bg-[#edf1e6] hover:text-[#b56b36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
            >
              See all
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {loading ? (
            <p role="status" className="py-8 text-center text-[#6d7468]">
              Loading favorites...
            </p>
          ) : error ? (
            <div className="py-8 text-center">
              <p role="alert" className="text-[#6d7468]">
                Unable to load featured products.
              </p>
              <button
                type="button"
                onClick={() => void refreshMenu()}
                className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-[#31573a] underline"
              >
                Try again
              </button>
            </div>
          ) : featuredItems.length === 0 ? (
            <p className="py-8 text-center text-[#6d7468]">
              Explore our freshly prepared menu.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {featuredItems.map((item) => {
              const startingPrice = item.variants.length
                ? Math.min(...item.variants.map((variant) => variant.price))
                : null;

              return (
                <Link
                  key={item.id}
                  to={`/product/${item.id}`}
                  aria-label={`${item.name}, from ₹${startingPrice ?? "price unavailable"}`}
                  className="group overflow-hidden rounded-2xl border border-[#e7e4d8] bg-white shadow-[0_8px_26px_-20px_rgba(30,51,35,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_-20px_rgba(30,51,35,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36] focus-visible:ring-offset-4 sm:rounded-3xl"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#e8eddf]">
                    <img
                      src={getMenuItemImage(item)}
                      alt={item.name}
                      width="900"
                      height="675"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-[#fff7e9]/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8d562e] shadow-sm sm:text-xs">
                      House favorite
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3.5 sm:p-5">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[#253b2a] sm:text-lg">
                        {item.name}
                      </h3>
                      <p className="mt-1 text-sm text-[#6d7468]">
                        From{" "}
                        <span className="font-semibold text-[#31573a]">
                          {startingPrice !== null ? `₹${startingPrice}` : "—"}
                        </span>
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf1e6] text-[#31573a] transition group-hover:bg-[#31573a] group-hover:text-white"
                    >
                      <ArrowRight size={17} />
                    </span>
                  </div>
                </Link>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="how-it-works-heading"
          className="overflow-hidden rounded-[2rem] bg-[#e9eddf] px-5 py-10 sm:px-10 sm:py-14 lg:px-14"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
              Good food, easy moments
            </p>
            <h2
              id="how-it-works-heading"
              className="font-serif text-3xl font-semibold tracking-tight text-[#253b2a] sm:text-4xl"
            >
              Fresh is just a few steps away
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#687265] sm:text-base">
              No queue, no fuss — just settle in and let us take care of the
              delicious part.
            </p>
          </div>
          <ol className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {orderingSteps.map(({ title, description, Icon }, index) => (
              <li key={title} className="relative flex gap-4 lg:block lg:text-center">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#31573a] shadow-sm lg:mx-auto">
                  <Icon size={21} aria-hidden="true" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#f6a45b] text-xs font-bold text-[#253b2a]">
                    {index + 1}
                  </span>
                </span>
                <div className="pt-1 lg:pt-4">
                  <h3 className="font-semibold text-[#253b2a]">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#687265]">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="visit-heading"
          className="relative overflow-hidden rounded-[2rem] bg-[#173923] px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:px-14"
        >
          <div className="absolute -right-12 -top-28 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
          <div className="relative max-w-xl">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#f6a45b]">
              A fresh little pause
            </p>
            <h2
              id="visit-heading"
              className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Your table is waiting
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/75 sm:text-base">
              H76V+J22, New Delhi, Delhi, India
            </p>
          </div>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f6a45b] px-6 py-3 font-semibold text-[#233b27] transition duration-200 hover:-translate-y-0.5 hover:bg-[#ffb36f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#173923] lg:mt-0"
          >
            <MapPin size={17} aria-hidden="true" />
            Get directions
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </section>
      </div>

      <footer className="border-t border-[#e6e3d8] pb-24 pt-8 text-center sm:pb-8">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg font-serif text-xl font-semibold text-[#253b2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56b36]"
        >
          <Leaf size={19} aria-hidden="true" className="text-[#b56b36]" />
          Fruits & Roots
        </Link>
        <p className="mt-2 text-sm text-[#6d7468]">
          Freshly made, every single cup.
        </p>
        <p className="mt-4 text-xs text-[#858a7e]">
          © {new Date().getFullYear()} Fruits & Roots
        </p>
      </footer>
    </>
  );
}
