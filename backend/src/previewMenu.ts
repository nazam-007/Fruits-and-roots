import express from "express";
import cors from "cors";
import helmet from "helmet";

export const approvedPreviewIds: readonly string[] = [
  "drink-banana",
  "drink-date",
  "drink-date-&-banana",
  "drink-mango",
  "drink-kiwi",
  "drink-dry-fruit",
  "drink-dragon",
  "drink-blueberry",
  "drink-strawberry",
  "drink-avocado",
  "drink-pineapple",
  "drink-mosambi",
  "drink-watermelon",
  "drink-beetroot",
  "drink-abc",
  "drink-grape",
  "drink-mix-fruit",
  "drink-anar",
  "drink-orange",
  "drink-apple",
  "drink-lassi",
  "drink-cold-coffee",
  "drink-persian-tea",
  "drink-turkish-tea",
  "drink-filter-coffee",
  "mix-fruit-salad",
  "exotic-fruit-salad",
  "fruit-date-delight",
  "biscoff-fruit-custard",
  "brownie-strawberry",
  "strawberry-chocolate",
  "single-choco-waffle",
  "triple-choco-waffle",
  "fruit-choco-waffle",
  "avocado-sandwich",
  "paneer-sandwich",
  "aalu-cheese-burger"
];
const categoryOrder = ["Liquid Therapy", "Fruitopia", "Guilty Pleasures", "Bread & Bite"];
export const previewMenuSql = `SELECT p.id,p.name,c.name AS category,p.image_url AS image,
 p.description,p.availability_status AS "availabilityStatus",false AS available,
 COALESCE((SELECT json_agg(json_build_object('size',v.size,'price',v.price) ORDER BY v.price)
 FROM public.product_variants v WHERE v.product_id=p.id),'[]'::json) AS variants
 FROM public.products p JOIN public.categories c ON c.id=p.category_id
 WHERE p.archived_at IS NULL AND p.id = ANY($1::varchar[])
 ORDER BY array_position($2::text[],c.name),p.name`;
export function createPreviewApp(readMenu: (sql: string, params: unknown[]) => Promise<{rows: Record<string, unknown>[]}>, origin: string) {
 const app=express();
 app.disable("x-powered-by"); app.use(helmet()); app.use(cors({origin,methods:["GET"],preflightContinue:true}));
 app.use((req,res,next)=>{ if(req.method!=="GET") {res.status(405).json({message:"Menu preview is read-only"});return;} next(); });
 app.get("/api/health",(_req,res)=>{res.json({status:"ok",mode:"menu-preview"});});
 app.get("/api/menu",async(_req,res)=>{try {
 const result=await readMenu(previewMenuSql,[approvedPreviewIds,categoryOrder]);
 res.json(result.rows.filter(row=>approvedPreviewIds.includes(String(row.id))).map(row=>({...row,available:false})));
 }catch {res.status(503).json({message:"Menu preview unavailable"});}});
 app.use((_req,res)=>{res.status(404).json({message:"Not found"});});
 return app;
}
