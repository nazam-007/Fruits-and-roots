import { test, expect } from "@playwright/test";
test("preview deep links expose no cart, payment or admin actions and only fetch menu",async({page})=>{
 const calls:string[]=[];
 await page.route("http://preview-api.invalid/**",async route=>{calls.push(route.request().method()+" "+new URL(route.request().url()).pathname);
 await route.fulfill({json:[{id:"drink-banana",name:"Banana",category:"Liquid Therapy",available:false,availabilityStatus:"AVAILABLE",variants:[{size:"Regular",price:129}]}]});});
 for(const path of ["/","/checkout","/payment/synthetic","/admin"]){
 await page.goto(path);await expect(page.getByText("Menu Preview — Ordering Unavailable")).toBeVisible();await expect(page.getByRole("heading",{name:"Banana",exact:true})).toBeVisible();
 await expect(page.getByRole("button")).toHaveCount(0);await expect(page.getByRole("link")).toHaveCount(0);
 }
 expect(calls.length).toBeGreaterThan(0);expect(calls.every(call=>call==="GET /api/menu")).toBe(true);
 await page.setViewportSize({width:320,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
