/**
 * Switchboard data model — §7 of FINAL_SPEC.md.
 *
 * FROZEN IN PHASE 0. All four workstreams write against this.
 * Pasted verbatim from the spec; only `export` is added. If a field needs to
 * change, say it out loud to the whole team first — the board, the demo seed,
 * and the hub all bind to these names.
 */

export type ScopeLease = {
  id: string
  sessionId: string
  humanId: string
  taskId: string | null
  paths: string[]
  status: 'held' | 'released' | 'expired' | 'deferred'
  grantedAt: number
  expiresAt: number
  intent: string            // from UserPromptSubmit, or inferred from the task
  editCount: number
}

export type Session = {
  id: string                // Claude Code session_id
  humanId: string
  humanName: string
  machine: string           // hostname — how the room sees "different computers"
  agentKind: 'claude-code' | 'codex' | 'other'
  status: 'active' | 'idle' | 'stale' | 'gone'
  lastSeen: number
  lastPrompt: string
  currentTaskId: string | null
  color: string

  /**
   * ADDITION BEYOND §7 — optional, so nothing written against the frozen model
   * breaks by ignoring it.
   *
   * §4 required an identical Claude Code version on all four laptops and gated it
   * in Phase 0. Recording the version per session replaces that hard gate with an
   * observation: mixed versions are allowed, the board can show a badge, and if
   * one session behaves oddly the version spread is already on screen.
   */
  claudeVersion?: string
}

export type Task = {
  id: string
  title: string
  area: 'frontend' | 'backend' | 'infra' | 'tests'
  suggestedPaths: string[]
  dependsOn: string[]       // powers sequencing
  status: 'open' | 'in_progress' | 'blocked' | 'done'
  claimedBy: string | null
}

export type Contract = {
  id: string
  kind: 'http_route' | 'type' | 'component_prop' | 'env_var'
  name: string              // "POST /api/cart/items"
  definedIn: string
  consumedBy: string[]
  version: number
  lastChangedBy: string | null
}

export type Notice = {
  id: string
  toSessionId: string
  kind: 'overlap_denied' | 'semantic_conflict' | 'contract_changed' | 'sequencing' | 'info'
  severity: 'block' | 'warn' | 'info'
  message: string           // factual, per §6.1
  relatedSessionId?: string
  contractName?: string     // for dedupe
  at: number
  delivered: boolean
}

export type TeamMemberProfile = {
  humanId: string
  rawContext: string        // what they pasted
  role: string
  strengths: string[]
  ownsAreas: string[]       // used by the adjudicator
  notes: string
}

export type HubState = {
  rev: number
  repo: { name: string; branch: string }
  sessions: Record<string, Session>
  leases: Record<string, ScopeLease>
  tasks: Record<string, Task>
  contracts: Record<string, Contract>
  notices: Notice[]
  profiles: Record<string, TeamMemberProfile>
  repoContext: string
  activity: { at: number; text: string; sessionId?: string; severity: string }[]
  buildStatus: 'unknown' | 'passing' | 'failing'
  hubHealth: {
    lastAdjudicationMs: number
    degradedSessions: string[]

    /**
     * ADDITION BEYOND §7 — optional.
     *
     * Set when active sessions report different Claude Code versions, e.g.
     * "2.1.191, 2.1.220". Mixed versions are supported, so this is an
     * observation for the board's badge, never a block. Kept separate from
     * degradedSessions so that field keeps its single meaning: sessions running
     * on the §5 L1 cache.
     */
    versionSpread?: string
  }
}
