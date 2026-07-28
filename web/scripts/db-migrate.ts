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
    // Bookkeeping table first, so we can skip already-applied files.
    await client.query(
      `create table if not exists public.schema_migrations (
         filename text primary key, applied_at timestamptz not null default now())`,
    );
    const { rows } = await client.query(`select filename from schema_migrations`);
    const applied = new Set(rows.map((r: { filename: string }) => r.filename));
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query(sql);
      await client.query(`insert into schema_migrations (filename) values ($1) on conflict do nothing`, [file]);
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
