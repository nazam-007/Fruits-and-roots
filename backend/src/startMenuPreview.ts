// Deliberately does not load dotenv or import the normal server/expiry worker.
import { Pool, type PoolClient } from "pg";
import { buildDatabaseConfig } from "./databaseConfig";
import { createPreviewApp } from "./previewMenu";
import { assertPreviewPrivileges, previewRelationsSql, previewCapabilitiesSql } from "./previewPrivileges";

async function main() {
 const url=new URL(process.env.DATABASE_URL || "");
 const ref="mrjsfznxbwjsdzyuzvsi";
 const direct=(url.port||"5432")==="5432" && url.hostname===`db.${ref}.supabase.co` && decodeURIComponent(url.username)==="fruits_roots_menu_preview";
 const session=url.hostname==="aws-0-ap-northeast-2.pooler.supabase.com" && (url.port||"5432")==="5432" && decodeURIComponent(url.username)===`fruits_roots_menu_preview.${ref}`;
 const origin=process.env.FRONTEND_ORIGIN || "";
 if ((!direct&&!session)||url.pathname!=="/postgres"||url.search||!url.password||process.env.DATABASE_TLS_MODE!=="verify-full"||new URL(origin).origin!==origin||!origin.startsWith("https://")) throw Error();
 const pool=new Pool({...buildDatabaseConfig(),statement_timeout:10000,connectionTimeoutMillis:10000,
 onConnect:async client=>{await client.query("SET default_transaction_read_only=on");}});
 // Startup validates metadata only, through the actual restricted connection.
 async function verifyClient(client: PoolClient) {
 const socket=(client as unknown as {connection:{stream:{encrypted?:boolean;authorized?:boolean}}}).connection.stream;
 if(!socket.encrypted||!socket.authorized) throw Error();
 const role=(await client.query(`SELECT current_user AS name,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,
 current_setting('default_transaction_read_only') AS read_only FROM pg_roles WHERE rolname=current_user`)).rows[0];
 const relations=(await client.query(previewRelationsSql)).rows;
 const capabilities=(await client.query(previewCapabilitiesSql)).rows[0];
 assertPreviewPrivileges(role || {},relations,capabilities || {});
 }
 const client=await pool.connect();
 try { await verifyClient(client); } finally {client.release();}
 const app=createPreviewApp(async (sql,params)=>{
   const leased=await pool.connect();
   try {
     // Detect drift before each read on the SAME connection, not only startup.
     await leased.query("SET default_transaction_read_only=on");
     await verifyClient(leased);
     return await leased.query(sql,params);
   } finally {leased.release();}
 },origin);
 const server=app.listen(Number(process.env.PORT||5000),"0.0.0.0");
 const stop=()=>server.close(()=>{void pool.end();}); process.once("SIGTERM",stop); process.once("SIGINT",stop);
}
void main().catch(()=>{console.error("Menu preview startup refused; review target, role, TLS and origin privately");process.exit(1);});
