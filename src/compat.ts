/**
 * Cross-version compatibility for hook responses.
 *
 * §4 demands all four laptops run an identical Claude Code version, and gates it
 * in Phase 0. That gate is real but expensive — it blocks a teammate whose
 * `claude` is a week behind, in a room where nobody has time to upgrade and
 * re-auth. This module removes the need for it.
 *
 * WHAT ACTUALLY DIFFERS ACROSS VERSIONS:
 *
 *   - `type: "http"` hooks did not always exist. On a version without them the
 *     L0 hook never fires AT ALL and that session has no enforcement. This is
 *     the one that matters, and the fix is client-side: a command-hook path that
 *     curls the hub (see client/.claude/hooks/pre-edit.sh). Command hooks and
 *     exit-code-2 blocking work on every version that has hooks.
 *
 *   - The PreToolUse decision envelope changed. Older builds read a top-level
 *     {"decision":"block","reason":"..."}; current builds read
 *     {"hookSpecificOutput":{"permissionDecision":"deny",...}}. We emit BOTH.
 *     A version that understands one ignores the other, so there is no downside.
 *
 *   - `additionalContext` on PreToolUse is newer. Emitting it on an old version
 *     is inert, not an error.
 *
 *   - `matcher` is sometimes exact-match and sometimes unanchored regex.
 *     "Edit|Write|MultiEdit|NotebookEdit" behaves identically under both, which
 *     is why §4 insists on no dots or brackets. Keep it that way and this is a
 *     non-issue.
 */

export type Decision = 'allow' | 'deny' | 'ask'

/**
 * Build a PreToolUse response that every version understands.
 *
 * `deny` is expressed three ways at once:
 *   - hookSpecificOutput.permissionDecision  (current)
 *   - top-level decision/reason              (older builds)
 * Both are advisory-safe: an unrecognized field is ignored, never an error. And
 * an ignored field is important to get right, because an unparseable hook
 * response fails OPEN and grants the edit.
 */
export const preToolUseResponse = (a: {
  decision: Decision
  reason?: string
  additionalContext?: string
}): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: a.decision,
      ...(a.reason ? { permissionDecisionReason: a.reason } : {}),
      ...(a.additionalContext ? { additionalContext: a.additionalContext } : {}),
    },
  }

  // Legacy envelope. "block"/"approve" were the old vocabulary; only emit the
  // blocking form, because emitting "approve" on an old version would override
  // another hook's deny and defeat the §5 L1 fallback running in parallel.
  if (a.decision === 'deny') {
    out.decision = 'block'
    out.reason = a.reason ?? 'Switchboard: this path is leased by another session.'
  }
  return out
}

/** Context-only response, valid on every event that accepts additionalContext. */
export const contextResponse = (
  event: string,
  additionalContext?: string,
): Record<string, unknown> =>
  additionalContext
    ? {
        hookSpecificOutput: { hookEventName: event, additionalContext },
        // Older builds read a bare top-level field for some events.
        additionalContext,
      }
    : {}

/**
 * Normalize a reported Claude Code version to a comparable tuple. Returns null
 * for anything unparseable — an unknown version is recorded as unknown and never
 * used to block, per §5's availability posture.
 */
export const parseVersion = (raw: string | undefined): number[] | null => {
  if (!raw) return null
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(raw)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export const formatVersion = (raw: string | undefined): string => {
  const v = parseVersion(raw)
  return v ? v.join('.') : 'unknown'
}

/**
 * Are these versions different enough to mention on the board?
 *
 * This is INFORMATIONAL ONLY. §4's hard gate becomes an observation: the board
 * shows a badge, nobody is blocked, and if something behaves oddly the version
 * spread is already on screen instead of being discovered at 1:40.
 */
export const versionsDiverge = (versions: readonly string[]): boolean => {
  const parsed = versions.map(parseVersion).filter((v): v is number[] => v !== null)
  if (parsed.length < 2) return false
  const key = (v: number[]) => v.join('.')
  return new Set(parsed.map(key)).size > 1
}
