import { useState } from "react";
import { Leaf, Search } from "lucide-react";
import snapshot from "./data/static-menu.snapshot.json";

export default function StaticMenu() {
  const [search, setSearch] = useState("");
  const matches = snapshot.products.filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <header className="border-b border-[#e8e2d5] bg-[#faf9f4]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
        <span className="rounded-full bg-[#31593b] p-3 text-white"><Leaf aria-hidden="true" size={24} /></span>
        <span className="font-serif text-2xl font-bold sm:text-3xl">Fruits <span className="text-[#b56b36]">&amp;</span> Roots</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <p className="text-sm font-semibold tracking-widest text-[#b56b36]">FRESH, FROM THE ROOTS UP</p>
      <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">Our café menu</h1>
      <p role="status" className="my-6 rounded-2xl border border-[#e8d8b5] bg-[#fff9ed] p-4 font-semibold">Menu Preview — Ordering Unavailable</p>
      <p className="mb-6 max-w-2xl text-sm text-[#737b6d]">Prices in Indian rupees. This is a saved menu snapshot, not live availability. Please confirm availability with café staff.</p>
      <label className="flex max-w-lg items-center gap-3 rounded-2xl border border-[#e8e2d5] bg-white px-4 py-3">
        <Search size={20} aria-hidden="true" /><span className="sr-only">Search menu</span>
        <input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Find your favourite" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      <nav aria-label="Menu categories" className="my-6 flex flex-wrap gap-2">
        {snapshot.categories.map(category => <a key={category.name} href={`#category-${category.sort_order}`} className="rounded-full border border-[#d8dfd1] bg-white px-4 py-2 text-sm font-semibold">{category.name}</a>)}
      </nav>
      {matches.length === 0 && <p className="py-8">No matching menu items.</p>}
      {snapshot.categories.map(category => {
        const items = matches.filter(item => item.category === category.name);
        return <section id={`category-${category.sort_order}`} key={category.name} className="my-10 scroll-mt-4" aria-label={category.name}>
          <h2 className="mb-5 font-serif text-3xl font-bold">{category.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => <article key={item.id} data-product-id={item.id} className="menu-product-card flex min-w-0 flex-col rounded-3xl border border-[#e8e2d5] bg-white p-5 sm:p-6">
              <h3 className="break-words font-serif text-xl font-bold">{item.name}</h3>
              <dl className="mt-4 space-y-2">
                {item.variants.map(variant => <div key={variant.size} className="flex justify-between gap-3"><dt className="text-sm text-[#737b6d]">{variant.size}</dt><dd className="font-semibold">₹{variant.price}</dd></div>)}
              </dl>
              {item.variants.length === 0 && <p className="mt-4 text-sm text-[#737b6d]">Price not listed — please ask café staff.</p>}
              {item.pendingRestoration ? <p className="mt-4 text-sm text-[#986032]">Source-menu item — pending database restoration. Availability not verified.</p>
                : <p className="mt-4 text-sm text-[#737b6d]">{item.availabilityStatus === "SOLD_OUT" ? "Sold out in saved menu" : item.availabilityStatus === "COMING_SOON" ? "Coming soon in saved menu" : item.available ? "Available in saved menu" : "Unavailable in saved menu"}</p>}
            </article>)}
          </div>
        </section>;
      })}
      <footer className="border-t border-[#e8e2d5] py-6 text-sm text-[#737b6d]">Fruits &amp; Roots · Menu only · No online orders or payments</footer>
    </main>
  </>;
}
