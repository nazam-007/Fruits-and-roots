import { useState } from "react";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router-dom";
import { Leaf, Search } from "lucide-react";
import illustration from "./preview-menu.svg";

// Illustrative public data only. Never import API clients, operational contexts or live snapshots.
const samples = [
  { id: "sample-juice", name: "Fresh Fruit Juice", category: "Liquid Therapy", description: "A colourful seasonal fruit blend. Illustration and prices are samples.", variants: [{ size: "Regular", price: 100 }, { size: "Large", price: 180 }] },
  { id: "sample-bowl", name: "Seasonal Fruit Bowl", category: "Fruitopia", description: "A bright selection of fruit, shown for preview purposes.", variants: [{ size: "Regular", price: 120 }] },
  { id: "sample-waffle", name: "Chocolate Waffle", category: "Guilty Pleasures", description: "A café treat represented by a sample illustration.", variants: [{ size: "Regular", price: 140 }] },
  { id: "sample-sandwich", name: "Garden Sandwich", category: "Bread & Bite", description: "A vegetable sandwich example from our sample menu.", variants: [{ size: "Regular", price: 90 }] },
];
const categories = [...new Set(samples.map(item => item.category))];

function Prices({ item }: { item: typeof samples[number] }) {
  return <dl className="my-4 space-y-2">{item.variants.map(variant =>
    <div key={variant.size} className="flex justify-between gap-4"><dt>{variant.size}</dt><dd className="font-semibold">₹{variant.price}</dd></div>,
  )}</dl>;
}

function Menu() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const items = samples.filter(item => (!category || item.category === category) && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <p className="text-sm font-semibold tracking-widest text-[#b56b36]">FRESH, FROM THE ROOTS UP</p>
    <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">Explore our sample menu</h1>
    <label className="my-6 flex max-w-lg items-center gap-3 rounded-2xl border border-[#e8e2d5] bg-white px-4 py-3">
      <Search size={20} aria-hidden="true" /><span className="sr-only">Search menu</span>
      <input className="min-w-0 flex-1 outline-none" type="search" placeholder="Find your favourite" value={search} onChange={event => setSearch(event.target.value)} />
    </label>
    <nav aria-label="Menu categories" className="my-6 flex flex-wrap gap-2">{["", ...categories].map(name =>
      <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)} className={`rounded-full border px-4 py-3 text-sm font-semibold ${category === name ? "bg-[#31593b] text-white" : "bg-white"}`}>{name || "All"}</button>,
    )}</nav>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map(item =>
      <article key={item.id} className="min-w-0 rounded-3xl border border-[#e8e2d5] bg-white p-5">
        <img src={illustration} alt="Sample fruit illustration" width="640" height="360" className="mb-4 w-full rounded-2xl" />
        <p className="text-sm text-[#737b6d]">{item.category}</p>
        <h2 className="font-serif text-2xl font-bold">{item.name}</h2>
        <Prices item={item} />
        <Link className="inline-block rounded-full bg-[#31593b] px-5 py-3 font-semibold text-white" to={`/product/${item.id}`}>View {item.name}</Link>
      </article>,
    )}</div>
    {!items.length && <p>No matching menu items.</p>}
  </>;
}

function Product() {
  const { id } = useParams();
  const item = samples.find(product => product.id === id);
  if (!item) return <Unavailable />;
  return <section className="mx-auto max-w-2xl rounded-3xl border border-[#e8e2d5] bg-white p-5 sm:p-8">
    <Link className="inline-block py-3 font-semibold underline" to="/menu">Back to menu</Link>
    <img src={illustration} alt="Sample fruit illustration" width="640" height="360" className="my-4 w-full rounded-2xl" />
    <p>{item.category}</p><h1 className="my-3 font-serif text-3xl font-bold">{item.name}</h1>
    <p>{item.description}</p><Prices item={item} />
    <p className="font-semibold">Ordering is unavailable in this preview.</p>
  </section>;
}

function Unavailable() {
  return <section><h1 className="font-serif text-3xl font-bold">This feature is unavailable in preview</h1>
    <p className="my-4">You can explore sample products. No orders, payments, tracking or admin operations are available.</p>
    <Link className="inline-block rounded-full bg-[#31593b] px-5 py-3 font-semibold text-white" to="/menu">Browse sample menu</Link>
  </section>;
}

export default function FrontendPreview() {
  return <BrowserRouter>
    <header className="border-b border-[#e8e2d5] bg-[#faf9f4]"><Link to="/menu" className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
      <Leaf aria-hidden="true" className="shrink-0 text-[#31593b]" size={32} /><span className="font-serif text-2xl font-bold sm:text-3xl">Fruits &amp; Roots</span>
    </Link></header>
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <p role="status" className="mb-4 rounded-2xl border border-[#e8d8b5] bg-[#fff9ed] p-4 font-semibold">Preview only — ordering coming soon</p>
      <p className="mb-8 text-sm text-[#737b6d]">Sample products, prices and illustrations only. This is not the live café menu or current availability.</p>
      <Routes><Route path="/" element={<Menu />} /><Route path="/menu" element={<Menu />} /><Route path="/product/:id" element={<Product />} /><Route path="*" element={<Unavailable />} /></Routes>
    </main>
  </BrowserRouter>;
}
