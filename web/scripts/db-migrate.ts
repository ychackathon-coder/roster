/**
 * Apply supabase/migrations/*.sql in filename order.
 *
 * Prefers DATABASE_URL_POOLER (IPv4) — the direct db.* host is IPv6-only from
 * some networks. Migrations are written idempotently (create if not exists), so
 * re-running is always safe.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "..", "supabase", "migrations");

function clientFromEnv(): pg.Client {
  const url = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;
  if (!url || /YOUR_PASSWORD/i.test(url)) {
    throw new Error("Set DATABASE_URL_POOLER (or DATABASE_URL) in web/.env.local");
  }
  return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no .sql files in ${MIGRATIONS_DIR}`);

  const client = clientFromEnv();
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query(sql);
      console.log(`applied ${file}`);
    }
    await client.query(`notify pgrst, 'reload schema'`);
    console.log("done — PostgREST schema reload notified");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
