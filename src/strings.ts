/**
 * Every string an agent will ever read. §6.1.
 *
 * WHY THIS IS ONE FILE: §15 rates "denial text surfaced to the human instead of
 * acted on" as Medium-high likelihood, and §13 Phase 5 requires a review of
 * every agent-facing string before the demo. One file means that review has one
 * place to look, and lintAgentString() below makes most of it automatic.
 *
 * THE RULE: factual statement of state. No imperatives, no policy language, no
 * second-person commands. Imperative out-of-band text reads as a possible
 * prompt injection, and the agent then shows it to its human rather than acting
 * on it — which from the audience's seat is indistinguishable from a broken
 * product.
 *
 * State first. Options as facts. Conclusion left to the agent.
 */

/** 24-hour local time, matching the "until 14:32" form in §6.1. */
export const formatTime = (ts: number): string => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const minutesAgo = (ts: number): string => {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000))
  if (mins === 0) return 'less than a minute ago'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

const list = (items: readonly string[]): string => (items.length ? items.join(', ') : 'none')

/**
 * The canonical denial — §6.1.
 *
 * Deviation from the spec's literal example, deliberate: the spec writes "Her
 * recorded intent is …". These strings render with real teammates' names at
 * runtime and the hub never learns anyone's pronouns, so the pronoun is dropped
 * rather than guessed. "Recorded intent is …" carries the same information and
 * cannot misgender anyone on the team.
 */
export const denialMessage = (a: {
  path: string
  holderName: string
  machine: string
  expiresAt: number
  intent: string
  freePaths: readonly string[]
  openTasks: readonly string[]
}): string => {
  const parts = [
    `Switchboard: ${a.path} is leased by ${a.holderName}'s session on ${a.machine} until ${formatTime(a.expiresAt)}.`,
  ]
  if (a.intent) parts.push(`Recorded intent is "${a.intent}".`)
  parts.push(`Paths in your task that are currently free: ${list(a.freePaths)}.`)
  parts.push(`Unassigned open tasks: ${list(a.openTasks)}.`)
  return parts.join(' ')
}

/** The canonical advisory — §6.1. Contract drift between two different files. */
export const advisoryMessage = (a: {
  path: string
  byName: string
  at: number
  contractName: string
  consumingPath: string
  changeNote?: string
}): string => {
  const parts = [
    `Switchboard: ${a.path} was modified by ${a.byName}'s session ${minutesAgo(a.at)}.`,
    `It defines ${a.contractName}, which ${a.consumingPath} consumes.`,
  ]
  if (a.changeNote) parts.push(a.changeNote)
  return parts.join(' ')
}

/**
 * Sequencing — §8 Tier 2. Returned with `defer` rather than `deny`, because
 * when work is genuinely coupled a lock only serializes, and serialization is
 * not coordination.
 */
export const sequencingMessage = (a: {
  path: string
  blockingTaskId: string
  blockingTaskTitle: string
  definesWhat?: string
  holderName?: string
}): string => {
  const parts = [`Switchboard: ${a.path} is part of work that depends on ${a.blockingTaskId}.`]
  parts.push(
    a.definesWhat
      ? `${a.blockingTaskId} defines ${a.definesWhat} and is in progress.`
      : `${a.blockingTaskId} "${a.blockingTaskTitle}" is in progress.`,
  )
  if (a.holderName) parts.push(`${a.holderName}'s session holds it.`)
  parts.push('The resulting shape will arrive as a notice when that lease releases.')
  return parts.join(' ')
}

/**
 * Semantic conflict — §8 Tier 3. Two workstreams that will fight while sharing
 * no file at all. Nothing else on the market produces this, so the string
 * carries the reasoning, not just the fact.
 */
export const semanticConflictMessage = (a: {
  otherName: string
  otherIntent: string
  reason: string
  sharedConcern?: string
}): string => {
  const parts = [
    `Switchboard: ${a.otherName}'s session has the recorded intent "${a.otherIntent}".`,
    `No file is shared with the current session. ${a.reason}`,
  ]
  if (a.sharedConcern) parts.push(`Both touch ${a.sharedConcern}.`)
  return parts.join(' ')
}

/** No lease exists yet — informational, used on queries rather than denials. */
export const noLeaseMessage = (path: string): string =>
  `Switchboard: no lease exists for ${path} under your session.`

/**
 * §6.2 mechanism 4: the MCP overflow pointer. One line, because the whole point
 * is that it costs almost nothing against the 4,000-char budget.
 */
export const overflowLine = (count: number): string =>
  `Switchboard: ${count} additional notice${count === 1 ? '' : 's'} pending. hub_get_notices returns full detail.`

/** L1 degraded mode — §5. Says plainly that the data may be stale. */
export const cachedDenialMessage = (a: {
  path: string
  holderName: string
  ageSec: number
}): string =>
  `Switchboard is offline and running on cached state. ${a.path} was leased by ${a.holderName} as of the last successful sync. Cached data may be up to ${a.ageSec} seconds old.`

/**
 * Seeded into context at SessionStart — §4.1 notes stdout there is added to
 * context, which makes this a free win: the agent opens already knowing the
 * board.
 */
export const sessionStartContext = (a: {
  humanName: string
  machine: string
  openTasks: readonly { id: string; title: string }[]
  activeSessions: readonly { humanName: string; machine: string; intent: string }[]
}): string => {
  const lines = [`Switchboard is coordinating this repo. This session is registered as ${a.humanName} on ${a.machine}.`]
  if (a.activeSessions.length) {
    lines.push('Other active sessions:')
    for (const s of a.activeSessions) {
      lines.push(`- ${s.humanName} on ${s.machine}${s.intent ? `: "${s.intent}"` : ''}`)
    }
  } else {
    lines.push('No other sessions are active.')
  }
  if (a.openTasks.length) {
    lines.push('Unassigned open tasks:')
    for (const t of a.openTasks) lines.push(`- ${t.id} ${t.title}`)
  }
  lines.push('Editing a file records a scope lease automatically. hub_get_board returns current state.')
  return lines.join('\n')
}

/* ------------------------------------------------------------------------- *
 * §6.1 enforcement — automates most of the Phase 5 string review.
 * ------------------------------------------------------------------------- */

/**
 * Patterns that make a string read as an instruction rather than a report.
 * Each is anchored to sentence-initial position or an explicit modal, because
 * "the file that must be edited" is a factual clause while "You must edit"
 * is a command.
 */
const IMPERATIVE_PATTERNS: readonly { re: RegExp; why: string }[] = [
  { re: /\b(?:you|your)\s+(?:must|should|need to|have to|cannot|can't|may not)\b/i, why: 'second-person modal' },
  { re: /(?:^|[.!?]\s+)(?:do not|don't|never|avoid|stop|wait|coordinate|claim|take|use|edit|release|choose|pick|switch)\b/i, why: 'sentence-initial imperative verb' },
  { re: /\bplease\b/i, why: 'requests are not state' },
  { re: /\bis (?:not )?(?:allowed|permitted|forbidden|prohibited)\b/i, why: 'policy language' },
  { re: /\byou are (?:not )?(?:allowed|permitted|authorized)\b/i, why: 'policy language' },
  { re: /\b(?:instead,|rather than proceeding)\b/i, why: 'directive framing' },
]

export type StringLintFinding = { why: string; match: string }

/**
 * Returns findings for a string intended for agent consumption. Empty array
 * means it reads as a statement of state.
 *
 * Note: possessive second person ("paths in your task") is intentionally
 * allowed — §6.1's own canonical denial uses it. What's disallowed is telling
 * the agent what to do.
 */
export const lintAgentString = (s: string): StringLintFinding[] => {
  const findings: StringLintFinding[] = []
  for (const { re, why } of IMPERATIVE_PATTERNS) {
    const m = re.exec(s)
    if (m) findings.push({ why, match: m[0].trim() })
  }
  return findings
}
