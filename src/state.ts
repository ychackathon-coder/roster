/**
 * Hub state — §7. One in-memory object, one mutation entry point.
 *
 * Everything that changes state goes through mutate(), which bumps `rev` and
 * notifies subscribers. The board re-renders on rev change; nothing polls.
 */
import { createWriteStream, type WriteStream } from 'node:fs'
import { config } from './config.js'
import type { HubState } from './types.js'

const state: HubState = {
  rev: 0,
  repo: { name: 'switchboard-demo', branch: 'main' },
  sessions: {},
  leases: {},
  tasks: {},
  contracts: {},
  notices: [],
  profiles: {},
  repoContext: '',
  activity: [],
  buildStatus: 'unknown',
  hubHealth: { lastAdjudicationMs: 0, degradedSessions: [] },
}

type Subscriber = (s: HubState) => void
const subscribers = new Set<Subscriber>()

let jsonl: WriteStream | null = null
if (config.persistJsonl) {
  jsonl = createWriteStream(config.jsonlPath, { flags: 'a' })
}

/**
 * Read-only view. Callers must not mutate — the fast path reads this directly
 * to stay allocation-free, so a stray write here corrupts state silently.
 */
export const read = (): Readonly<HubState> => state

/**
 * The only way to change hub state.
 *
 * Subscriber notification is wrapped per-subscriber: a thrown error in the
 * board websocket must never roll back a lease grant or take down the hub.
 */
export const mutate = <T>(label: string, fn: (s: HubState) => T): T => {
  const result = fn(state)
  state.rev += 1

  if (jsonl) {
    // Fire-and-forget. Buffered stream write, never awaited — the fast path
    // has a 50ms budget and disk is not allowed to eat into it.
    jsonl.write(`${JSON.stringify({ at: Date.now(), rev: state.rev, label })}\n`)
  }

  for (const sub of subscribers) {
    try {
      sub(state)
    } catch (err) {
      console.error('[state] subscriber threw, continuing:', err)
    }
  }
  return result
}

export const subscribe = (fn: Subscriber): (() => void) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Board activity feed, newest first, capped so a long session can't grow it forever. */
export const logActivity = (
  s: HubState,
  text: string,
  severity: 'block' | 'warn' | 'info' = 'info',
  sessionId?: string,
): void => {
  s.activity.unshift({ at: Date.now(), text, severity, ...(sessionId ? { sessionId } : {}) })
  if (s.activity.length > 200) s.activity.length = 200
}

/**
 * Overwrite the singleton from an external snapshot — the hydrate half of
 * load-modify-save on serverless.
 *
 * Mutates the existing object in place rather than rebinding, so every module
 * holding a reference from read() sees the new data. Does NOT notify subscribers:
 * hydration is not a state change anyone made, and broadcasting it would make the
 * board flash on every incoming request.
 */
export const replaceState = (next: HubState): void => {
  state.rev = next.rev ?? 0
  state.repo = next.repo ?? state.repo
  state.sessions = next.sessions ?? {}
  state.leases = next.leases ?? {}
  state.tasks = next.tasks ?? {}
  state.contracts = next.contracts ?? {}
  state.notices = next.notices ?? []
  state.profiles = next.profiles ?? {}
  state.repoContext = next.repoContext ?? ''
  state.activity = next.activity ?? []
  state.buildStatus = next.buildStatus ?? 'unknown'
  state.hubHealth = next.hubHealth ?? { lastAdjudicationMs: 0, degradedSessions: [] }
}

/** Plain snapshot for persistence. */
export const snapshot = (): HubState => state

/** Test seam — resets to a clean slate without reloading the module. */
export const __resetForTests = (): void => {
  state.rev = 0
  state.sessions = {}
  state.leases = {}
  state.tasks = {}
  state.contracts = {}
  state.notices = []
  state.profiles = {}
  state.activity = []
  state.buildStatus = 'unknown'
  state.hubHealth = { lastAdjudicationMs: 0, degradedSessions: [] }
}
