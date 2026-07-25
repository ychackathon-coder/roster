/**
 * The scope lease — §1, and the fast path from §3.
 *
 * A lease is created WITHOUT being requested. An agent edits a file, PreToolUse
 * fires, and the hub either records a lease and stays silent or refuses and
 * explains. The agent experiences coordination as a property of the repo rather
 * than a protocol it has to follow, which is what makes enforcement independent
 * of whether the agent cooperates.
 *
 * BUDGET: everything in evaluateEdit() must stay under 50ms. In-memory only.
 * No model call, no disk, no network. Judgment lives on the slow path.
 */
import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import { anyPathOverlaps, normalize, relativize } from './overlap.js'
import { logActivity } from './state.js'
import { denialMessage, sequencingMessage } from './strings.js'
import type { HubState, ScopeLease, Session, Task } from './types.js'

export type EditDecision =
  | { kind: 'allow'; leaseId: string; created: boolean }
  | { kind: 'deny'; reason: string; blockingLease: ScopeLease }
  | { kind: 'defer'; reason: string; blockingLease: ScopeLease }

/* --------------------------------- queries -------------------------------- */

export const heldLeases = (s: HubState): ScopeLease[] =>
  Object.values(s.leases).filter((l) => l.status === 'held')

/**
 * The first held lease from another session that covers this path.
 * Deterministic ordering by grantedAt so two racing edits resolve the same way
 * regardless of object key order.
 */
export const findBlockingLease = (
  s: HubState,
  path: string,
  sessionId: string,
): ScopeLease | null => {
  const candidates = heldLeases(s)
    .filter((l) => l.sessionId !== sessionId && anyPathOverlaps(l.paths, path))
    .sort((a, b) => a.grantedAt - b.grantedAt)
  return candidates[0] ?? null
}

/** This session's own held lease covering the path, if any. */
export const findOwnLease = (s: HubState, path: string, sessionId: string): ScopeLease | null =>
  heldLeases(s).find((l) => l.sessionId === sessionId && anyPathOverlaps(l.paths, path)) ?? null

const taskFor = (s: HubState, session: Session | undefined): Task | null => {
  if (!session?.currentTaskId) return null
  return s.tasks[session.currentTaskId] ?? null
}

/**
 * Is the work genuinely coupled, or merely co-located?
 *
 * Coupled means one task declares a dependsOn edge on the other, in either
 * direction. That distinction drives §3 step 5 vs step 6: coupled work gets
 * `defer` (an ordered handoff), independent work gets `deny` (go do something
 * else). §17.1 argues defer should eventually become the general default;
 * today it fires only where the dependency graph proves the coupling.
 */
export const isCoupled = (s: HubState, a: Session | undefined, b: Session | undefined): boolean => {
  const ta = taskFor(s, a)
  const tb = taskFor(s, b)
  if (!ta || !tb || ta.id === tb.id) return false
  return ta.dependsOn.includes(tb.id) || tb.dependsOn.includes(ta.id)
}

/** Paths on this session's task that no other session currently holds. */
export const freePathsForSession = (s: HubState, session: Session | undefined): string[] => {
  const task = taskFor(s, session)
  if (!task) return []
  return task.suggestedPaths.filter((p) => !findBlockingLease(s, p, session?.id ?? ''))
}

/** "T-07 checkout button loading state" — the form §6.1 uses. */
export const unassignedOpenTasks = (s: HubState): string[] =>
  Object.values(s.tasks)
    .filter((t) => t.status === 'open' && t.claimedBy === null)
    .map((t) => `${t.id} ${t.title}`)

/* -------------------------------- mutations ------------------------------- */

export const createLease = (
  s: HubState,
  a: { session: Session; path: string; status?: ScopeLease['status']; cwd?: string },
): ScopeLease => {
  const now = Date.now()
  const task = taskFor(s, a.session)
  const lease: ScopeLease = {
    id: randomUUID(),
    sessionId: a.session.id,
    humanId: a.session.humanId,
    taskId: task?.id ?? null,
    // Repo-relative, ALWAYS — see relativize() in overlap.ts. Storing the raw
    // absolute path is what makes cross-machine collisions invisible.
    paths: [relativize(a.path, a.cwd)],
    status: a.status ?? 'held',
    grantedAt: now,
    expiresAt: now + config.leaseTtlMs,
    intent: a.session.lastPrompt || task?.title || '',
    editCount: 0,
  }
  s.leases[lease.id] = lease
  return lease
}

/** Same session touching a path it already holds: extend, don't duplicate. */
export const refreshLease = (lease: ScopeLease, path: string, cwd?: string): void => {
  lease.expiresAt = Date.now() + config.leaseTtlMs
  lease.editCount += 1
  const p = relativize(path, cwd)
  if (!lease.paths.includes(p)) lease.paths.push(p)
}

/**
 * The §3 fast path, steps 1-6. Step 7 (attaching notices) happens in the hook
 * layer, because the budget is a property of the response, not of the lease.
 *
 * Returns a decision; performs the lease mutation itself so callers can't
 * forget to. Must be called inside mutate().
 */
export const evaluateEdit = (
  s: HubState,
  a: { sessionId: string; path: string; cwd?: string },
): EditDecision => {
  const session = s.sessions[a.sessionId]

  // Step 1. An unregistered session is not a reason to block an edit — that
  // would make a missed SessionStart look like a broken repo. §5's posture:
  // availability beats enforcement in the write path.
  if (!session) {
    return { kind: 'allow', leaseId: '', created: false }
  }
  session.lastSeen = Date.now()
  session.status = 'active'

  // Reconcile to repo-relative BEFORE any comparison. Every stored lease path is
  // repo-relative, so a raw absolute path here would match nothing.
  const rel = relativize(a.path, a.cwd)

  // Step 4 first: the common case on a multi-edit turn is the same session
  // touching a file it already holds. Checking it before the blocking scan
  // keeps the hot path short.
  const own = findOwnLease(s, rel, a.sessionId)
  if (own) {
    refreshLease(own, rel)
    return { kind: 'allow', leaseId: own.id, created: false }
  }

  // Step 2.
  const blocking = findBlockingLease(s, rel, a.sessionId)

  // Step 3.
  if (!blocking) {
    const lease = createLease(s, { session, path: rel })
    logActivity(s, `${session.humanName} took ${rel}`, 'info', session.id)
    return { kind: 'allow', leaseId: lease.id, created: true }
  }

  const holder = s.sessions[blocking.sessionId]
  const holderName = holder?.humanName ?? 'another session'

  // Step 5 — coupled work becomes an ordered handoff rather than a refusal.
  if (isCoupled(s, session, holder)) {
    const blockingTask = blocking.taskId ? s.tasks[blocking.taskId] : null
    const reason = sequencingMessage({
      path: rel,
      blockingTaskId: blockingTask?.id ?? 'the blocking task',
      blockingTaskTitle: blockingTask?.title ?? blocking.intent,
      holderName,
    })
    // Record the wait so releasing the blocker can notify this session. §7's
    // 'deferred' status exists for exactly this.
    createLease(s, { session, path: rel, status: 'deferred' })
    logActivity(s, `${session.humanName} deferred on ${rel} behind ${holderName}`, 'warn', session.id)
    return { kind: 'defer', reason, blockingLease: blocking }
  }

  // Step 6 — independent work colliding on one file.
  const reason = denialMessage({
    path: rel,
    holderName,
    machine: holder?.machine ?? 'another machine',
    expiresAt: blocking.expiresAt,
    intent: blocking.intent,
    freePaths: freePathsForSession(s, session),
    openTasks: unassignedOpenTasks(s),
  })
  logActivity(s, `${session.humanName} denied on ${rel} — held by ${holderName}`, 'block', session.id)
  return { kind: 'deny', reason, blockingLease: blocking }
}

/* ------------------------------ release / expiry -------------------------- */

/** Returns the sessions that were waiting on the released paths. */
export const releaseLease = (s: HubState, leaseId: string): string[] => {
  const lease = s.leases[leaseId]
  if (!lease || lease.status !== 'held') return []
  lease.status = 'released'
  return waitersFor(s, lease)
}

/** Deferred leases that overlap a lease being released — §8 Tier 2 handoff. */
export const waitersFor = (s: HubState, lease: ScopeLease): string[] => {
  const waiting = Object.values(s.leases).filter(
    (l) => l.status === 'deferred' && l.sessionId !== lease.sessionId &&
      l.paths.some((p) => anyPathOverlaps(lease.paths, p)),
  )
  return [...new Set(waiting.map((l) => l.sessionId))]
}

/**
 * §13 Phase 4: a dead session's leases free and its task returns to open.
 * Called by the sweep and by session-end.
 */
export const releaseSessionLeases = (s: HubState, sessionId: string): string[] => {
  const woken: string[] = []
  for (const lease of Object.values(s.leases)) {
    if (lease.sessionId !== sessionId) continue
    if (lease.status === 'held') {
      lease.status = 'released'
      woken.push(...waitersFor(s, lease))
    } else if (lease.status === 'deferred') {
      lease.status = 'released'
    }
  }
  returnTasksOf(s, sessionId)
  return [...new Set(woken)]
}

/** A task claimed by a session that is gone goes back on the board. */
const returnTasksOf = (s: HubState, sessionId: string): void => {
  const session = s.sessions[sessionId]
  for (const task of Object.values(s.tasks)) {
    if (task.claimedBy && (task.claimedBy === sessionId || task.claimedBy === session?.humanId)) {
      if (task.status !== 'done') {
        task.status = 'open'
        task.claimedBy = null
        logActivity(s, `${task.id} returned to the board`, 'warn')
      }
    }
  }
}

/**
 * TTL expiry and stale-session detection. Runs on an interval, never in the
 * write path. Returns sessions that should be told a blocker cleared.
 */
export const sweep = (s: HubState): { woken: string[]; expired: number; gone: string[] } => {
  const now = Date.now()
  const woken: string[] = []
  let expired = 0

  for (const lease of Object.values(s.leases)) {
    if (lease.status === 'held' && lease.expiresAt <= now) {
      lease.status = 'expired'
      expired += 1
      woken.push(...waitersFor(s, lease))
      const holder = s.sessions[lease.sessionId]
      logActivity(
        s,
        `lease on ${lease.paths.join(', ')} expired${holder ? ` (${holder.humanName})` : ''}`,
        'info',
        lease.sessionId,
      )
    }
  }

  const gone: string[] = []
  for (const session of Object.values(s.sessions)) {
    const silentFor = now - session.lastSeen
    if (session.status === 'gone') continue
    if (silentFor > config.staleAfterMs) {
      session.status = 'gone'
      gone.push(session.id)
      woken.push(...releaseSessionLeases(s, session.id))
      logActivity(s, `${session.humanName}'s session went quiet — scopes freed`, 'warn', session.id)
    } else if (silentFor > config.sessionGoneAfterMs && session.status === 'active') {
      session.status = 'idle'
    }
  }

  return { woken: [...new Set(woken)], expired, gone }
}
