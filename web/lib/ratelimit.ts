/**
 * Fixed-window rate limiting backed by Postgres, so limits hold across
 * serverless instances. One indexed upsert per check — cheap at this scale.
 *
 * Fails OPEN on database trouble: a rate-limit outage must degrade to
 * "unlimited", never take the product down with it.
 */
import { NextResponse } from "next/server";
import { pool } from "./db";

export type LimitSpec = { limit: number; windowSec: number };

export const LIMITS = {
  // Each index call fetches GitHub live; keep it deliberate.
  indexRepo: { limit: 5, windowSec: 600 } satisfies LimitSpec,
  hq: { limit: 30, windowSec: 60 } satisfies LimitSpec,
  orgCreate: { limit: 5, windowSec: 3600 } satisfies LimitSpec,
  orgJoin: { limit: 20, windowSec: 3600 } satisfies LimitSpec,
  runnerMint: { limit: 10, windowSec: 3600 } satisfies LimitSpec,
} as const;

export async function rateLimit(
  key: string,
  spec: LimitSpec,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  try {
    const { rows } = await pool().query(
      `insert into rate_limits (key, window_start, count)
       values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       on conflict (key, window_start) do update set count = rate_limits.count + 1
       returning count,
         extract(epoch from window_start + ($2 || ' seconds')::interval - now())::int as remaining`,
      [key, spec.windowSec],
    );
    const row = rows[0]!;
    // Opportunistic cleanup, ~1% of checks: old windows are pure garbage.
    if (Math.random() < 0.01) {
      void pool().query(`delete from rate_limits where window_start < now() - interval '1 day'`).catch(() => {});
    }
    return { allowed: Number(row.count) <= spec.limit, retryAfterSec: Math.max(1, Number(row.remaining)) };
  } catch (err) {
    console.warn(`[ratelimit] check failed open: ${(err as Error).message}`);
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** 429 with Retry-After when over; null when allowed. */
export async function enforceLimit(
  bucket: keyof typeof LIMITS,
  scopeId: string,
): Promise<NextResponse | null> {
  const spec = LIMITS[bucket];
  const { allowed, retryAfterSec } = await rateLimit(`${bucket}:${scopeId}`, spec);
  if (allowed) return null;
  return NextResponse.json(
    { error: `rate limit exceeded — try again in ${retryAfterSec}s`, retry_after: retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
