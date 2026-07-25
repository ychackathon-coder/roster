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

/** Applied in order. Both are idempotent (create table if not exists). */
const MIGRATIONS = ["supabase-events.sql", "supabase-team-profiles.sql"];

async function main() {
  const client = clientFromEnv();
  await client.connect();
  try {
    for (const file of MIGRATIONS) {
      const sql = readFileSync(path.join(process.cwd(), "data", file), "utf8");
      await client.query(sql);
      console.log(`applied ${file}`);
    }
    await client.query(`notify pgrst, 'reload schema'`);
    console.log(
      "Migrated public.events + public.team_profiles + RLS; notified PostgREST schema reload",
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
