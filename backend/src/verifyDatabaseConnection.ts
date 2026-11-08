import "dotenv/config";
import { db } from "./db";
import type { TLSSocket } from "node:tls";

// Uses the very same pool/config as API routes. Never prints connection URLs,
// usernames, certificates, tokens or provider error messages.
async function main() {
  const client = await db.connect();
  try {
    const socket = (client as unknown as { connection: { stream: TLSSocket } }).connection.stream;
    const transport = {
      encrypted: socket.encrypted === true,
      certificateAuthorized: socket.authorized === true,
      protocol: socket.encrypted ? socket.getProtocol() : null,
    };
    await client.query("BEGIN READ ONLY");
    const upstream = await client.query("SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    const role = await client.query(
      `SELECT current_user = 'fruits_roots_backend' AS expected_role,
              rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname = current_user`,
    );
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ transport, databaseHop: upstream.rows[0], role: role.rows[0] }));
    const flags = role.rows[0];
    if (!transport.encrypted || !transport.certificateAuthorized || !flags?.expected_role ||
        flags.rolsuper || flags.rolbypassrls || flags.rolcreatedb || flags.rolcreaterole) {
      throw new Error("Database security verification failed.");
    }
  } finally { client.release(); }
}

void main().catch(() => {
  console.error("Database connection security check failed; inspect TLS/role configuration privately.");
  process.exitCode = 1;
}).finally(() => db.end());
