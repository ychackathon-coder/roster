/**
 * Apply data/supabase-events.sql via Postgres.
 * Prefers DATABASE_URL_POOLER (IPv4) over direct DATABASE_URL (often IPv6-only).
 */
import { readFileSync } from "fs";
import path from "path";
import pg from "pg";

function clientFromEnv(): pg.Client {
  const pooler = process.env.DATABASE_URL_POOLER;
  const direct = process.env.DATABASE_URL;
  const url = pooler || direct;
  if (!url || /YOUR_PASSWORD|\[YOUR-PASSWORD\]/i.test(url)) {
    throw new Error(
      "Set DATABASE_URL_POOLER or DATABASE_URL in .env.local with your real DB password",
    );
  }
  return new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
}

async function main() {
  const sql = readFileSync(
    path.join(process.cwd(), "data", "supabase-events.sql"),
    "utf8",
  );
  const client = clientFromEnv();
  await client.connect();
  try {
    await client.query(sql);
    await client.query(`notify pgrst, 'reload schema'`);
    console.log(
      "Migrated public.events + RLS; notified PostgREST schema reload",
    );
    console.log(
      "using",
      process.env.DATABASE_URL_POOLER ? "DATABASE_URL_POOLER" : "DATABASE_URL",
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
