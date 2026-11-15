import { useEffect, useState } from "react";
import type { MenuItem } from "./data/menu";
export default function MenuPreview() {
 const [items,setItems]=useState<MenuItem[]>([]); const [error,setError]=useState(!import.meta.env.VITE_API_URL); const [loading,setLoading]=useState(Boolean(import.meta.env.VITE_API_URL));
 useEffect(()=>{const controller=new AbortController(); let active=true;
 const base=import.meta.env.VITE_API_URL;
 if(!base)return;
 void fetch(`${base}/api/menu`,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(active)setItems(data);}).catch(e=>{if(active&&e.name!=="AbortError")setError(true);}).finally(()=>{if(active)setLoading(false);});
 return ()=>{active=false;controller.abort();};},[]);
 return <main className="mx-auto max-w-6xl p-4 sm:p-8">
 <h1 className="text-3xl font-bold">Fruits &amp; Roots</h1>
 <p role="status" className="my-6 rounded-xl border p-4 font-semibold">Menu Preview — Ordering Unavailable</p>
 {loading&&<p>Loading menu...</p>}{error&&<p role="alert">Menu unavailable. Please try again later.</p>}
 {["Liquid Therapy","Fruitopia","Guilty Pleasures","Bread & Bite"].map(category=><section key={category} className="my-8">
 <h2 className="mb-4 text-2xl font-bold">{category}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {items.filter(item=>item.category===category).map(item=><article key={item.id} className="min-w-0 rounded-xl border p-4">
 <h3 className="break-words text-xl font-semibold">{item.name}</h3>
 {item.description&&<p>{item.description}</p>}
 {item.variants.map(v=><p key={v.size}>{v.size}: ₹{v.price}</p>)}
 {item.availabilityStatus!=="AVAILABLE"&&<p>{item.availabilityStatus==="SOLD_OUT"?"Sold out":"Coming soon"}</p>}
 </article>)} </div></section>)}
 </main>;
}
