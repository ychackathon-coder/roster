/**
 * State persistence — the one thing serverless forces on us.
 *
 * §12 says "Persistence: In memory" and forbids a database, and for a hub running
 * on one laptop that is exactly right: zero latency, zero setup, and the fast
 * path stays under 50ms.
 *
 * Serverless breaks that assumption outright. Every invocation may land on a
 * different instance with a different heap, so an in-memory lease granted by one
 * request is invisible to the next. Two agents would both be told "allow" for the
 * same file — the failure the whole product exists to prevent.
 *
 * So: a pluggable store.
 *
 *   memory  (default)  the §12 design, unchanged. One process, no network, no
 *                      dependency. Use this for a laptop hub on the LAN.
 *   redis              Upstash REST, for Vercel. Load-modify-save per request
 *                      with a short lock around mutations.
 *
 * COST OF REDIS MODE, stated plainly: the fast path becomes two network round
 * trips instead of zero. Expect roughly 40-150ms per edit depending on region,
 * against §3's 50ms target. That is a real regression and the reason memory mode
 * remains the default. It buys a publicly reachable hub, which removes §15's
 * highest-likelihood risk (cross-machine networking) entirely.
 */
import type { HubState } from './types.js'

export type Unlock = () => Promise<void>

export type StateStore = {
  readonly kind: 'memory' | 'redis'
  /** Null when nothing has been stored yet. */
  load(): Promise<HubState | null>
  save(state: HubState): Promise<void>
  /**
   * Best-effort mutual exclusion around a mutating request. Returns a release
   * function, or null when the lock could not be taken.
   *
   * Deliberately fails OPEN: if the lock is unavailable we proceed anyway. §5's
   * posture applies to our own infrastructure too — a coordination plane must
   * never be able to wedge four engineers, so a stuck lock degrades to a possible
   * double-grant rather than a hung edit.
   */
  lock(ms: number): Promise<Unlock | null>
}

/* --------------------------------- memory --------------------------------- */

/**
 * No-op store. The in-process singleton in state.ts IS the state; there is
 * nothing to load or save, and one process needs no lock.
 */
export const memoryStore: StateStore = {
  kind: 'memory',
  async load() {
    return null
  },
  async save() {
    /* nothing to do */
  },
  async lock() {
    return async () => {}
  },
}

/* ---------------------------------- redis --------------------------------- */

type UpstashConfig = { url: string; token: string }

const upstashConfig = (): UpstashConfig | null => {
  // Vercel's KV integration and a bare Upstash database use different env names.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.REDIS_REST_URL
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

const STATE_KEY = process.env.SB_STATE_KEY ?? 'switchboard:state'
const LOCK_KEY = `${STATE_KEY}:lock`

/** One or more Redis commands in a single HTTP round trip. */
const pipeline = async (
  cfg: UpstashConfig,
  commands: (string | number)[][],
): Promise<unknown[]> => {
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    // Never let a slow store hold an edit open longer than the hook timeout.
    signal: AbortSignal.timeout(2_500),
  })
  if (!res.ok) throw new Error(`upstash ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { result?: unknown; error?: string }[]
  return body.map((r) => {
    if (r.error) throw new Error(`upstash command failed: ${r.error}`)
    return r.result
  })
}

export const createRedisStore = (cfg: UpstashConfig): StateStore => ({
  kind: 'redis',

  async load() {
    try {
      const [raw] = await pipeline(cfg, [['GET', STATE_KEY]])
      if (typeof raw !== 'string' || !raw) return null
      return JSON.parse(raw) as HubState
    } catch (err) {
      // A read failure must not deny an edit. Returning null means "start from
      // whatever this instance has", which is the fail-open choice.
      console.warn('[store] load failed, continuing with local state:', (err as Error).message)
      return null
    }
  },

  async save(state) {
    try {
      // 2h expiry: a hackathon hub should not leave state lying around forever,
      // and a stale document from yesterday's run is worse than an empty one.
      await pipeline(cfg, [['SET', STATE_KEY, JSON.stringify(state), 'EX', 7200]])
    } catch (err) {
      console.warn('[store] save failed, state may diverge:', (err as Error).message)
    }
  },

  async lock(ms) {
    try {
      const [res] = await pipeline(cfg, [['SET', LOCK_KEY, '1', 'NX', 'PX', ms]])
      if (res !== 'OK') return null
      return async () => {
        try {
          await pipeline(cfg, [['DEL', LOCK_KEY]])
        } catch {
          /* the PX expiry is the backstop */
        }
      }
    } catch (err) {
      console.warn('[store] lock failed, proceeding unlocked:', (err as Error).message)
      return async () => {}
    }
  },
})

/* --------------------------------- selection ------------------------------- */

/**
 * Redis when credentials are present OR when running on Vercel; memory
 * otherwise.
 *
 * The Vercel check is deliberate and loud: a serverless deployment WITHOUT a
 * store is silently broken — leases vanish between requests and every edit is
 * granted. Better to shout about it at boot than to discover it on stage.
 */
export const selectStore = (): StateStore => {
  const cfg = upstashConfig()
  if (cfg) return createRedisStore(cfg)

  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    console.error(
      '[store] RUNNING ON VERCEL WITH NO REDIS. Leases cannot survive between\n' +
        '        requests, so every edit will be granted and nothing will ever be\n' +
        '        denied. Add an Upstash/Vercel KV integration and set\n' +
        '        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.',
    )
  }
  return memoryStore
}

export const store: StateStore = selectStore()
