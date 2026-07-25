/**
 * The notice queue and the §6.2 budget.
 *
 * THE PROBLEM: additionalContext and hook stdout are capped at 10,000
 * characters. Overflow is written to a file and replaced with a preview, so an
 * important notice can silently become a file path the agent never opens. A
 * blocking notice lost that way looks exactly like a product that doesn't work.
 *
 * FOUR MECHANISMS, in order:
 *   1. Hard budget of 4,000 chars — asserted, not hoped for.
 *   2. Priority ordering: block > semantic_conflict > contract_changed >
 *      sequencing > info, then recency.
 *   3. Dedupe by (kind, relatedSessionId, contractName) — newest wins.
 *   4. MCP as the overflow channel — push a pointer, let the agent pull detail.
 *
 * Mechanism 4 is the architectural point, not a workaround: hooks are the PUSH
 * channel and are budget-constrained by the platform; MCP is the PULL channel
 * and has no such limit.
 */
import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import { overflowLine } from './strings.js'
import type { HubState, Notice } from './types.js'

export type NoticeDraft = {
  toSessionId: string
  kind: Notice['kind']
  severity: Notice['severity']
  message: string
  relatedSessionId?: string
  contractName?: string
}

/** §6.2 mechanism 2. Lower rank is delivered first. */
const KIND_RANK: Record<Notice['kind'], number> = {
  overlap_denied: 1,
  semantic_conflict: 2,
  contract_changed: 3,
  sequencing: 4,
  info: 5,
}

/** A blocking notice outranks everything regardless of kind. */
const rank = (n: Notice): number => (n.severity === 'block' ? 0 : KIND_RANK[n.kind])

const byPriorityThenRecency = (a: Notice, b: Notice): number =>
  rank(a) - rank(b) || b.at - a.at

/**
 * §6.2 mechanism 3: dedupe by (kind, relatedSessionId, contractName).
 *
 * When a notice carries NEITHER a related session nor a contract name there is
 * no dimension to dedupe on, and keying on kind alone would collapse every
 * unrelated `info` into one — silently swallowing distinct messages, which is
 * the §15 risk-6 failure this file exists to prevent. Those fall back to
 * message identity, so exact repeats still collapse and different notices both
 * survive.
 */
const dedupeKey = (n: NoticeDraft | Notice): string => {
  const dimensioned = n.relatedSessionId !== undefined || n.contractName !== undefined
  return dimensioned
    ? `${n.kind}|${n.relatedSessionId ?? '-'}|${n.contractName ?? '-'}`
    : `${n.kind}|msg|${n.message}`
}

/**
 * Queue a notice for a session, replacing any undelivered notice with the same
 * dedupe key. The same contract warning never goes out twice.
 */
export const queueNotice = (s: HubState, draft: NoticeDraft): Notice => {
  const key = dedupeKey(draft)
  // Newest wins: drop the older undelivered duplicate entirely.
  s.notices = s.notices.filter(
    (n) => n.delivered || n.toSessionId !== draft.toSessionId || dedupeKey(n) !== key,
  )
  const notice: Notice = {
    id: randomUUID(),
    toSessionId: draft.toSessionId,
    kind: draft.kind,
    severity: draft.severity,
    message: draft.message,
    ...(draft.relatedSessionId ? { relatedSessionId: draft.relatedSessionId } : {}),
    ...(draft.contractName ? { contractName: draft.contractName } : {}),
    at: Date.now(),
    delivered: false,
  }
  s.notices.push(notice)

  // Unbounded growth protection: a long demo with a chatty slow path shouldn't
  // grow this array forever. Delivered notices are the ones safe to shed.
  if (s.notices.length > 500) {
    const keep = s.notices.filter((n) => !n.delivered)
    s.notices = keep.length > 500 ? keep.slice(-500) : keep
  }
  return notice
}

export const pendingFor = (s: HubState, sessionId: string): Notice[] =>
  s.notices.filter((n) => n.toSessionId === sessionId && !n.delivered)

/** §6.2: more than four pending for one session triggers slow-path compaction. */
export const needsCompaction = (s: HubState, sessionId: string): boolean =>
  pendingFor(s, sessionId).length > config.compactionThreshold

export type DrainResult = {
  /** Ready for additionalContext. Empty string when there is nothing to say. */
  context: string
  /** Notices marked delivered by this drain. */
  delivered: Notice[]
  /** Count left behind, reachable via hub_get_notices. */
  overflow: number
}

/**
 * Fill the response budget by priority and mark what went out.
 *
 * "Assert, don't hope" — §6.2. A silent overflow is worse than a dropped
 * notice, because you won't know it happened. Every drop is logged.
 *
 * Undelivered notices are NOT discarded: they stay queued for the next hook and
 * are always reachable over MCP, which is what makes the pointer line honest.
 */
export const drainForSession = (
  s: HubState,
  sessionId: string,
  budget: number = config.noticeBudgetChars,
): DrainResult => {
  const pending = pendingFor(s, sessionId).sort(byPriorityThenRecency)
  if (pending.length === 0) return { context: '', delivered: [], overflow: 0 }

  const chosen: Notice[] = []
  let used = 0
  // Reserve room for the overflow pointer so it can never itself be squeezed
  // out — a truncated queue with no pointer is the silent failure we're
  // engineering against.
  const reserve = overflowLine(pending.length).length + 2

  for (const notice of pending) {
    const cost = notice.message.length + (chosen.length ? 2 : 0)
    const ceiling = budget - (pending.length > chosen.length + 1 ? reserve : 0)
    if (used + cost <= ceiling) {
      chosen.push(notice)
      used += cost
      continue
    }
    // A blocking notice must always get through. If one is individually larger
    // than the entire budget, that's a bug in whoever wrote it — trim at a
    // sentence boundary rather than dropping it, and say so loudly.
    if (notice.severity === 'block' && chosen.length === 0) {
      const room = Math.max(0, ceiling)
      const cut = notice.message.slice(0, room)
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'))
      const trimmed = lastStop > 200 ? cut.slice(0, lastStop + 1) : cut
      console.error(
        `[notices] BLOCKING notice ${notice.id} is ${notice.message.length} chars, over the ${budget} budget. Trimmed to guarantee delivery. Shorten the string.`,
      )
      chosen.push({ ...notice, message: trimmed })
      used += trimmed.length
    }
    break
  }

  const overflow = pending.length - chosen.length
  if (overflow > 0) {
    console.warn(
      `[notices] session ${sessionId}: delivered ${chosen.length}, ${overflow} over budget -> MCP pointer`,
    )
  }

  const parts = chosen.map((n) => n.message)
  if (overflow > 0) parts.push(overflowLine(overflow))
  const context = parts.join('\n\n')

  // Mark the real queue entries delivered. Uses ids because a blocking notice
  // may have been trimmed into a copy above.
  const deliveredIds = new Set(chosen.map((n) => n.id))
  const delivered: Notice[] = []
  for (const n of s.notices) {
    if (deliveredIds.has(n.id)) {
      n.delivered = true
      delivered.push(n)
    }
  }

  // The invariant this whole file exists to protect.
  if (context.length > budget) {
    console.error(
      `[notices] BUDGET VIOLATION: built ${context.length} chars against a ${budget} budget`,
    )
  }
  return { context, delivered, overflow }
}

/** Replace a session's pending notices with one compacted paragraph (slow path). */
export const applyCompaction = (s: HubState, sessionId: string, paragraph: string): void => {
  const pending = pendingFor(s, sessionId)
  if (pending.length === 0) return
  // Preserve the highest severity present so priority ordering still holds.
  const worst = pending.some((n) => n.severity === 'block')
    ? 'block'
    : pending.some((n) => n.severity === 'warn')
      ? 'warn'
      : 'info'
  const ids = new Set(pending.map((n) => n.id))
  s.notices = s.notices.filter((n) => !ids.has(n.id))
  queueNotice(s, {
    toSessionId: sessionId,
    kind: 'info',
    severity: worst as Notice['severity'],
    message: paragraph,
  })
}
