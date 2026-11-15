import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { approvedPreviewIds, createPreviewApp, previewMenuSql } from "./previewMenu";
test("preview IDs exactly match reviewed 37-product manifest",()=>{
 const manifest=JSON.parse(readFileSync("../docs/menu-restoration/approved-menu.manifest.json","utf8"));
 assert.equal(approvedPreviewIds.length,37); assert.deepEqual([...approvedPreviewIds].sort(),manifest.products.map((p:{id:string})=>p.id).sort());
});
test("preview refuses mutation methods and unmounted operational routes without database access",async()=>{
 let reads=0;const app=createPreviewApp(async()=>{reads++;return {rows:[]};},"https://preview.example");
 const server=app.listen(0,"127.0.0.1"); await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try {
 for(const method of ["POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]) for(const path of ["/api/menu","/api/orders","/api/admin/auth/login","/api/razorpay/webhook"]){assert.equal((await fetch(base+path,{method})).status,405);}
 for(const path of ["/api/orders","/api/admin","/api/menu/status","/api/menu/events","/api/payment"]){assert.equal((await fetch(base+path)).status,404);}
 assert.equal((await fetch(base+"/api/health")).status,200);assert.equal(reads,0);
 }finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test("preview uses parameterized allowlist and excludes unexpected rows; forces ordering off",async()=>{
 const app=createPreviewApp(async(sql,params)=>{assert.equal(sql,previewMenuSql);assert.deepEqual(params[0],approvedPreviewIds);return {rows:[{id:approvedPreviewIds[0],available:true},{id:"banana-shake-unapproved",available:true}]};},"https://preview.example");
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
 try {const rows=await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/menu`)).json();assert.equal(rows.length,1);assert.equal(rows[0].available,false);assert.match(previewMenuSql,/p.archived_at IS NULL/);assert.match(previewMenuSql,/ANY\(\$1/);}
 finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test("preview errors disclose no database diagnostics",async()=>{
 const app=createPreviewApp(async()=>{throw Error("private database details");},"https://preview.example"); const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/menu`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{message:"Menu preview unavailable"});}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

import { assertPreviewPrivileges, forbiddenPreviewRelation, previewRelationsSql, previewCapabilitiesSql, type PreviewRelation } from "./previewPrivileges";
const safeRole = {name:"fruits_roots_menu_preview",read_only:"on",rolcanlogin:true,
 rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false};
const safeCapabilities = {memberships:false,database_create:false,schema_create:false,sequence_grant:false,reachable_definer:false};
const menuRelations: PreviewRelation[] = ["categories","products","product_variants"].map(relation_name=>({schema_name:"public",relation_name,schema_usage:true,can_read:true,table_mutation:false,column_mutation:false}));
const extensionView: PreviewRelation = {schema_name:"extensions",relation_name:"pg_stat_statements",schema_usage:false,can_read:true,table_mutation:false,column_mutation:false};
test("inaccessible PUBLIC SELECT on extension view is tolerated without granting schema access",()=>{
 assert.equal(forbiddenPreviewRelation(extensionView),false);
 assert.doesNotThrow(()=>assertPreviewPrivileges(safeRole,[...menuRelations,extensionView],safeCapabilities));
});
test("schema USAGE makes cross-schema SELECT reachable and forbidden",()=>{
 assert.throws(()=>assertPreviewPrivileges(safeRole,[...menuRelations,{...extensionView,schema_usage:true}],safeCapabilities));
});
test("unexpected mutation grants fail even without schema USAGE",()=>{
 for(const field of ["table_mutation","column_mutation"]){
 assert.throws(()=>assertPreviewPrivileges(safeRole,[...menuRelations,{...extensionView,[field]:true}],safeCapabilities));
 }
});
test("menu SELECT requires schema USAGE and all three menu relations",()=>{
 assert.throws(()=>assertPreviewPrivileges(safeRole,menuRelations.slice(1),safeCapabilities));
 assert.throws(()=>assertPreviewPrivileges(safeRole,menuRelations.map(row=>({...row,schema_usage:false})),safeCapabilities));
});
test("financial or session reads in public and other schemas are forbidden",()=>{
 for(const schema_name of ["public","private"]){for(const relation_name of ["orders","payments","customers","admin_sessions"]){
 assert.throws(()=>assertPreviewPrivileges(safeRole,[...menuRelations,{...extensionView,schema_name,relation_name,schema_usage:true}],safeCapabilities));
 }}
});
test("NOINHERIT alone is insufficient: unexpected membership capability is rejected",()=>{
 assert.throws(()=>assertPreviewPrivileges(safeRole,menuRelations,{...safeCapabilities,memberships:true}));
 assert.throws(()=>assertPreviewPrivileges({...safeRole,rolinherit:true},menuRelations,safeCapabilities));
});
test("elevated flags, sequence access, CREATE and reachable definers fail closed",()=>{
 for(const flag of ["rolsuper","rolbypassrls","rolcreatedb","rolcreaterole","rolreplication"]){
 assert.throws(()=>assertPreviewPrivileges({...safeRole,[flag]:true},menuRelations,safeCapabilities));}
 for(const flag of ["database_create","schema_create","sequence_grant","reachable_definer"]){
 assert.throws(()=>assertPreviewPrivileges(safeRole,menuRelations,{...safeCapabilities,[flag]:true}));}
});
test("MAINTAIN and sequence privileges are included in actual metadata SQL",()=>{
 assert.match(previewRelationsSql,/TRUNCATE,MAINTAIN,REFERENCES/);
 assert.match(previewRelationsSql,/has_schema_privilege\(current_user,n.oid,'USAGE'\)/);
 assert.match(previewCapabilitiesSql,/has_sequence_privilege\(current_user,c.oid,'SELECT,USAGE,UPDATE'\)/);
 assert.match(previewCapabilitiesSql,/OR \(m.roleid=/);
});
test("missing or malformed privilege metadata cannot pass",()=>{
 assert.throws(()=>assertPreviewPrivileges({},menuRelations,safeCapabilities));
 assert.throws(()=>assertPreviewPrivileges(safeRole,menuRelations,{}));
 assert.throws(()=>assertPreviewPrivileges(safeRole,[...menuRelations,{...extensionView,schema_usage:undefined as unknown as boolean}],safeCapabilities));
});
test("SQL proposal applies the same reachable-read and unconditional mutation distinction",()=>{
 const sql=readFileSync("../docs/menu-restoration/proposed_preview_role.sql","utf8");
 assert.match(sql,/OR \(has_schema_privilege\('fruits_roots_menu_preview',n.oid,'USAGE'\) AND/);
 assert.match(sql,/TRUNCATE,MAINTAIN,REFERENCES/);
 assert.doesNotMatch(sql,/GRANT USAGE ON SCHEMA extensions/i);
});

test("database restrictive product and variant scopes exactly match the manifest",()=>{
 const sql=readFileSync("../docs/menu-restoration/proposed_preview_role.sql","utf8");
 const manifest=JSON.parse(readFileSync("../docs/menu-restoration/approved-menu.manifest.json","utf8"));
 const ids=manifest.products.map((p:{id:string})=>p.id).sort();
 const arrays=[...sql.matchAll(/ARRAY\[([\s\S]*?)\]::varchar\[\]/g)];
 assert.equal(arrays.length,2);
 for(const array of arrays){assert.deepEqual([...array[1].matchAll(/'([^']+)'/g)].map(m=>m[1]).sort(),ids);}
 assert.match(sql,/fr_menu_preview_product_scope ON public.products AS RESTRICTIVE/);
 assert.match(sql,/fr_menu_preview_variant_scope ON public.product_variants AS RESTRICTIVE/);
 assert.match(sql,/USING \(archived_at IS NULL AND id = ANY/);
 assert.match(sql,/p.id=product_id AND p.archived_at IS NULL AND p.id = ANY/);
 assert.doesNotMatch(sql,/banana-shake-/);
 assert.equal((sql.match(/CREATE POLICY/g)||[]).length,5);
});
test("default proposal fails on global table/sequence grants instead of revoking global defaults",()=>{
 const sql=readFileSync("../docs/menu-restoration/proposed_public_default_privileges.sql","utf8");
 assert.match(sql,/d.defaclnamespace=0 AND d.defaclobjtype IN \('r','S'\)/);
 assert.match(sql,/pg_has_role\('anon',a.grantee,'MEMBER'\)/);
 assert.ok(sql.indexOf("Global table/sequence client defaults remain")<sql.indexOf("ALTER DEFAULT PRIVILEGES"));
 const statements=sql.replace(/--[^\n]*/g,"");
 assert.equal((statements.match(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/g)||[]).length,3);
 assert.doesNotMatch(statements,/FOR ROLE supabase_admin|IN SCHEMA (storage|auth|extensions|realtime)/);
});

test("isolation validates all five sequence names and kinds before permission changes",()=>{
 const sql=readFileSync("../docs/menu-restoration/proposed_client_isolation.sql","utf8");
 const guard=sql.slice(sql.indexOf("DO $$ BEGIN"),sql.indexOf("DECLARE relation_name"));
 const expected=["order_number_seq","order_items_id_seq","payments_id_seq","product_variants_id_seq","restaurant_tables_id_seq"];
 for(const name of expected)assert.ok(guard.includes(`'${name}'`));
 assert.match(guard,/c.oid IS NULL OR c.relkind<>'S'/);
 assert.ok(sql.indexOf("Application sequence inventory mismatch")<sql.indexOf("EXECUTE format('REVOKE"));
});
test("default guard handles PUBLIC directly and uses conservative PostgreSQL MEMBER semantics",()=>{
 const sql=readFileSync("../docs/menu-restoration/proposed_public_default_privileges.sql","utf8");
 assert.equal((sql.match(/CASE WHEN a.grantee=0 THEN true/g)||[]).length,2);
 assert.equal((sql.match(/a.grantee IN \('anon'::regrole,'authenticated'::regrole\)/g)||[]).length,2);
 assert.equal((sql.match(/pg_has_role\('anon',a.grantee,'MEMBER'\)/g)||[]).length,2);
 assert.doesNotMatch(sql,/pg_has_role\('public'/i);
});

test("real preview query joins categories and variants without changing stored prices",()=>{
 assert.match(previewMenuSql,/JOIN public.categories c ON c.id=p.category_id/);
 assert.match(previewMenuSql,/FROM public.product_variants v WHERE v.product_id=p.id/);
 assert.match(previewMenuSql,/'price',v.price/);
 assert.match(previewMenuSql,/p.id = ANY\(\$1::varchar\[\]\)/);
 const sql=readFileSync("../docs/menu-restoration/proposed_preview_role.sql","utf8");
 const productScope=sql.slice(sql.indexOf("CREATE POLICY fr_menu_preview_product_scope"),sql.indexOf("CREATE POLICY fr_menu_preview_select ON public.product_variants"));
 assert.doesNotMatch(productScope,/FROM public.product_variants/);
 assert.match(sql,/FROM public.products p[\s\S]*p.id=product_id/);
});

test("sequence privilege checks use CASE rather than assuming WHERE evaluation order",()=>{
 assert.match(previewCapabilitiesSql,/CASE WHEN c.relkind='S' THEN has_sequence_privilege[\s\S]*?ELSE false END/);
 const proposal=readFileSync("../docs/menu-restoration/proposed_preview_role.sql","utf8");
 assert.match(proposal,/CASE WHEN c.relkind='S' THEN has_sequence_privilege[\s\S]*?ELSE false END/);
});

test("only postgres bootstrap-granted ADMIN-only incoming membership is excepted",()=>{
 assert.match(previewCapabilitiesSql,/m.member=\(SELECT oid FROM pg_roles WHERE rolname='postgres'\)/);
 assert.match(previewCapabilitiesSql,/m.admin_option AND NOT m.inherit_option AND NOT m.set_option/);
 assert.match(previewCapabilitiesSql,/m.grantor=10 AND EXISTS[\s\S]*g.rolsuper/);
 assert.match(previewCapabilitiesSql,/WHERE m.member=\(SELECT oid FROM pg_roles WHERE rolname=current_user\)/);
 const proposal=readFileSync("../docs/menu-restoration/proposed_preview_role.sql","utf8");
 assert.match(proposal,/m.admin_option AND NOT m.inherit_option AND NOT m.set_option/);
 assert.match(proposal,/m.grantor=10/);
});
test("every menu read verifies the same leased client before SQL and releases it",()=>{
 const startup=readFileSync("src/startMenuPreview.ts","utf8");
 assert.match(startup,/await verifyClient\(leased\);[\s\S]*return await leased.query\(sql,params\)/);
 assert.match(startup,/finally \{leased.release\(\);\}/);
});
