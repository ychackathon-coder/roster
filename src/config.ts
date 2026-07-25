/**
 * Runtime config. Every value has a working default so the hub boots with no
 * .env at all — Phase 0 has enough to get wrong without config being part of it.
 */
import 'dotenv/config'

const int = (v: string | undefined, fallback: number): number => {
  const n = v === undefined ? NaN : Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  port: int(process.env.PORT, 8787),

  /**
   * 0.0.0.0, not localhost. §12 names this the #1 failure mode: bound to
   * localhost the hub is invisible to every other laptop in the room and the
   * failure looks like "hooks don't work" rather than "wrong bind address".
   */
  host: process.env.HOST ?? '0.0.0.0',

  leaseTtlMs: int(process.env.LEASE_TTL_MS, 10 * 60 * 1000),

  /** How often expired leases are swept. */
  sweepIntervalMs: 5_000,

  /** A session unheard-from for this long shows as stale on the board. */
  staleAfterMs: 90_000,

  /** A stale session's leases are released — §13 Phase 4, within 10 seconds. */
  sessionGoneAfterMs: 10_000,

  /**
   * §6.2 mechanism 1: hard budget, well under the platform's 10,000-char cap
   * on additionalContext. Over-budget notices are DROPPED, never truncated
   * mid-sentence, and the drop is logged.
   */
  noticeBudgetChars: 4_000,

  /** §6.2: more than this many pending notices triggers slow-path compaction. */
  compactionThreshold: 4,

  /** §5 L1: cached lease state older than this is not trusted. */
  cacheMaxAgeSec: 90,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,

  /**
   * Slow-path model. Adjudication and semantic-conflict detection are async and
   * never in the write path, so latency is free and the capable model is right.
   */
  model: process.env.SWITCHBOARD_MODEL ?? 'claude-sonnet-5',

  persistJsonl: (process.env.PERSIST_JSONL ?? 'false') === 'true',
  jsonlPath: process.env.JSONL_PATH ?? 'switchboard.jsonl',
} as const

/** True when the slow path can make model calls. Everything degrades if false. */
export const hasModel = (): boolean => config.anthropicApiKey !== null
