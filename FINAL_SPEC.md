# Switchboard — Final Spec

**Pitch:** Switchboard lets several people run coding agents against one codebase at the same time. It sees every edit before it lands, prevents collisions, warns about coupling that git can't see, and keeps four parallel workstreams coherent enough to ship one feature.

**The sentence:** Every parallel-agent tool today runs N agents on one machine for one person. Switchboard runs N agents across M people's machines, on one repo, and the work still fits together at the end.

**RFS:** *Multiplayer AI* (primary), *Software for Agents* (secondary), *Company Brain* (via the context pack).

**Constraint:** 2 hours, 4 people, live demo + code submission.

**Status of the eight known issues:** 1 mitigated with a layered fallback (§5) and turned into a judge talking point (§16). 2 fixed — 3s timeouts throughout (§4). 3 implemented — curl command hook for registration (§4). 4 implemented as the agent communication protocol (§6), also a judge talking point (§16). 5 implemented as the two-speed architecture (§3). 6 implemented as a Phase 0 gate (§13). 7 solved with a priority notice budget and MCP overflow channel (§6.2). 8 unsolved by design — documented as a known open problem for judges (§17).

---

## 1. Core primitive: the implicit scope lease

A **scope lease** is an exclusive, time-limited, hub-granted right for one session to modify a set of paths.

It is created without being requested. An agent edits `CartItem.tsx`; `PreToolUse` fires; the hub either creates a lease and stays silent, or refuses and explains. The agent experiences coordination as a property of the repo rather than a protocol it has to follow — which means enforcement never depends on the agent cooperating.

**Design rule:** if a feature can't be expressed as a lease operation or a query over the lease registry, it's out of scope for the hackathon.

---

## 2. Architecture at a glance

| Component | Role | Owner |
| --- | --- | --- |
| Hub | Lease registry, task board, notice queue, adjudicator | A |
| Hook endpoints | `/hooks/*` — every agent event arrives here | B |
| MCP endpoint | Voluntary agent queries, and the notice overflow channel | B |
| Board WS + UI | The projector view | C |
| Local cache + fallback hook | Degraded-mode enforcement when the hub is unreachable | B |
| Demo repo, seed, script | The thing being built and the story | D |

One Node process serves the hook endpoints, the MCP endpoint, and the board websocket.

---

## 3. Two-speed architecture

The most important structural decision in the build. Get it wrong and the demo is unwatchable, because a model call inside a blocking hook costs 2–5 seconds per edit across four agents.

### Fast path — blocking, target under 50 ms

Runs inside `PreToolUse`. Pure in-memory. No model call, no disk, no network beyond the request itself.

1. Resolve `session_id` → session → human.
2. Test `tool_input.file_path` against every `held` lease.
3. No overlap → create lease, return `200` with an empty body.
4. Overlap, same session → refresh TTL, return `200` empty.
5. Overlap, different session, coupled work → `permissionDecision: "defer"`.
6. Overlap, different session, independent work → `permissionDecision: "deny"` with a factual reason.
7. Attach queued notices as `additionalContext` within the budget from §6.2.

### Slow path — async, never blocks an edit

Runs on the hub after the response is already sent. Results are delivered on the *next* hook that fires for that session.

- **Adjudication.** Two sessions collide → one Claude call reads both intents, both recent diffs, and the context pack, then decides whether the work is genuinely incompatible or merely co-located, and proposes a split.
- **Semantic conflict detection.** Scans active intents across all sessions for pairs that will fight *without* sharing a file. Nothing else on the market produces this.
- **Contract drift.** A lease over a path that defines a registered contract → notices queued for every session holding a consumer path.
- **Integration signal.** `PostToolUse` on `Bash` reports build and test exit codes; failures correlate to recently active leases.
- **Notice compaction.** More than four pending notices for one session → one Claude call collapses them into a single paragraph.

"We separated permission from judgment" is a good line in the pitch, and it's literally true of the code.

---

## 4. Hook wiring

Config lives in `.claude/settings.json`, committed to the demo repo, so every session picks it up on clone. `HUB` is the hub host's LAN IP.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/register.sh",
            "args": [],
            "timeout": 5,
            "statusMessage": "Joining Switchboard"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "http",
            "url": "http://HUB:8787/hooks/pre-edit",
            "timeout": 3,
            "statusMessage": "Checking scope"
          },
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/fallback-check.sh",
            "args": [],
            "timeout": 2
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "http", "url": "http://HUB:8787/hooks/post-edit", "timeout": 3 },
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/refresh-cache.sh",
            "args": [],
            "async": true,
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "http", "url": "http://HUB:8787/hooks/post-bash", "timeout": 3 }
        ]
      }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "http", "url": "http://HUB:8787/hooks/prompt", "timeout": 3 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "http", "url": "http://HUB:8787/hooks/turn-end", "timeout": 3 } ] }
    ],
    "SessionEnd": [
      { "hooks": [ { "type": "http", "url": "http://HUB:8787/hooks/session-end", "timeout": 3 } ] }
    ]
  }
}
```

### Non-negotiable details

- **Every hook has an explicit `timeout` of 3 seconds** (5 for `SessionStart` and the async cache refresh). The platform default is 600 seconds — omitting it means a wedged hub freezes four agents for ten minutes on stage. This is the single highest-consequence line in the config.
- **`SessionStart` does not accept `type: "http"`.** Only `command` and `mcp_tool` are supported, and `mcp_tool` is unreliable here because MCP servers typically haven't finished connecting when `SessionStart` fires. Registration is therefore a curl script (§4.1).
- **HTTP hooks cannot block via status code.** A denial requires a `200` response with the decision in the JSON body. Non-2xx, timeout, and connection failure are all *non-blocking* errors and the edit proceeds — see §5.
- **`matcher` uses exact tool names joined by `|`.** `Edit|Write|MultiEdit|NotebookEdit` stays on the exact-match path. Any dot or bracket flips it to unanchored regex.
- **Skip the `if` field entirely.** It's best-effort, fails open, and its path-matching semantics changed across recent versions. Match on tool name; let the hub decide.
- **All four laptops must run the same Claude Code version.** Gated in Phase 0. Matcher parsing and path semantics differ across 2.1.191 / .195 / .214.
- **HTTP hooks dedupe by URL** within a matcher group — give each endpoint a distinct path.
- **Two `PreToolUse` hooks fire in parallel** and precedence is deny > defer > ask > allow. That's what makes the fallback in §5 work without extra wiring.

### 4.1 `register.sh`

```bash
#!/bin/bash
# .claude/hooks/register.sh — SessionStart. HTTP hooks are unsupported here.
input=$(cat)
sid=$(jq -r '.session_id' <<<"$input")
cwd=$(jq -r '.cwd' <<<"$input")

resp=$(curl -sS --max-time 4 -X POST "http://$SB_HUB:8787/hooks/session-start" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$sid" --arg host "$(hostname)" \
        --arg human "${SB_HUMAN:-$USER}" --arg cwd "$cwd" \
        '{session_id:$sid, machine:$host, human:$human, cwd:$cwd}')" ) || true

# Seed the local cache so the fallback hook has something to work with.
curl -sS --max-time 4 "http://$SB_HUB:8787/leases/snapshot" \
  -o "$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json" 2>/dev/null || true

ctx=$(jq -r '.additionalContext // empty' <<<"$resp" 2>/dev/null)
if [ -n "$ctx" ]; then
  jq -nc --arg c "$ctx" \
    '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}'
fi
exit 0
```

`SB_HUB` and `SB_HUMAN` go in each person's shell profile in Phase 0. Note that `SessionStart` stdout is added to context, so the hub can seed the agent with the board state at session open — a free win.

---

## 5. Availability: fail-open, and the layered fallback

**The platform behavior:** HTTP hooks fail open. If the hub is slow, unreachable, or returns non-2xx, the edit proceeds. This is not something we can turn off.

**Our position:** this is the correct default and we would choose it deliberately even if we could change it. A coordination plane must never be able to brick four engineers mid-sprint. Availability beats enforcement for a tool that sits in the write path of every edit. But shipping only that would be sloppy, so enforcement degrades in tiers rather than vanishing.

| Tier | Mechanism | Active when | Guarantee |
| --- | --- | --- | --- |
| **L0** | HTTP hook to live hub | Normal | Authoritative. Real-time leases, notices, adjudication |
| **L1** | Local cache + `fallback-check.sh` command hook | Hub unreachable | Blocks edits to paths known held within the last 90s |
| **L2** | Git pre-commit hook | Always | Refuses a commit containing changes to paths another session leased |
| **L3** | Recorded demo video | Presentation only | The demo runs regardless |

L0 and L1 fire in parallel on the same event; because precedence is deny > defer > ask > allow, either one can block. L1 never *grants* — it either denies on cached knowledge or stays silent and lets the normal flow proceed.

### 5.1 `fallback-check.sh`

```bash
#!/bin/bash
# .claude/hooks/fallback-check.sh — L1 degraded-mode enforcement.
# Only ever denies. Silence means "no opinion", not "approved".
input=$(cat)
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
sid=$(jq -r '.session_id' <<<"$input")
cache="$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json"

[ -z "$path" ] && exit 0
[ ! -f "$cache" ] && exit 0

# Stale cache is untrustworthy — bounded fail-open after 90 seconds.
age=$(( $(date +%s) - $(jq -r '.fetchedAt // 0' "$cache") ))
[ "$age" -gt 90 ] && exit 0

holder=$(jq -r --arg p "$path" --arg s "$sid" '
  .leases[] | select(.status=="held") | select(.sessionId != $s)
  | select(any(.paths[]; . == $p)) | .humanName' "$cache" | head -1)

if [ -n "$holder" ]; then
  jq -nc --arg h "$holder" --arg p "$path" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("Switchboard is offline and running on cached state. "
        + $p + " was leased by " + $h + " as of the last successful sync. "
        + "Cached data may be up to 90 seconds old.")
    }
  }'
fi
exit 0
```

`refresh-cache.sh` is the same curl to `/leases/snapshot`, run with `"async": true` so it never blocks an edit.

**Say this in the pitch.** Volunteering a known weakness with a layered answer reads as engineering maturity. Being caught by it reads as naivety. Full wording in §16.

---

## 6. Agent communication protocol

The hub talks to agents, not humans. That turns out to be its own discipline, and getting it wrong silently breaks the product.

### 6.1 Factual state, never imperatives

Agent-facing text must be a **factual statement of state**. No commands, no policy language, no second person.

The reason is concrete: imperative out-of-band text can read as a prompt-injection attempt, in which case the agent surfaces the text to its human instead of acting on it. A denial that gets shown to the user instead of triggering a re-plan looks identical to a broken product from the audience's seat.

| Don't write | Write instead |
| --- | --- |
| "Do not edit this file." | "This file is leased by Maya's session until 14:32." |
| "You must claim scope first." | "No lease exists for this path under your session." |
| "Take task T-07 instead." | "T-07 is open and unassigned." |
| "Coordinate with Dev before proceeding." | "Dev's session is modifying the route this file consumes." |
| "Wait for the type to be defined." | "T-01 defines CartItem.variantId and is in progress." |

State first, options as facts, conclusion left to the agent. One person reviews every agent-facing string against this table before the demo. It's on the Phase 5 checklist.

**Canonical denial string:**

```
Switchboard: web/src/components/Cart/CartItem.tsx is leased by Maya's
session on maya-mbp until 14:32. Her recorded intent is "add quantity
stepper and wire optimistic update". Paths in your task that are
currently free: CartSummary.tsx, CartTotals.tsx. Unassigned open
tasks: T-07 checkout button loading state.
```

**Canonical advisory string:**

```
Switchboard: api/routes/cart.ts was modified by Dev's session 4 minutes
ago. It defines POST /api/cart/items, which this file consumes. The
request payload now includes a variantId field.
```

### 6.2 The notice budget — solving the 10,000-character cap

`additionalContext` and hook stdout are capped at 10,000 characters. Overflow is written to a file and replaced with a preview, which means an important notice can silently become a file path the agent never opens. Four mechanisms, in order:

**1. Hard budget of 4,000 characters per response.** Well under the cap, leaving headroom for anything else in the turn. Asserted in code before returning; over-budget content is dropped, not truncated mid-sentence.

**2. Priority ordering.** Notices sort by severity, then recency:

```
block  >  semantic_conflict  >  contract_changed  >  sequencing  >  info
```

Fill until the budget is spent. A blocking notice always gets through.

**3. Deduplication.** Dedupe by `(kind, relatedSessionId, contractName)`. The same contract warning never goes out twice; the newest wins and the older one is dropped from the queue.

**4. MCP as the overflow channel.** Anything that doesn't fit collapses to one line:

```
Switchboard: 3 additional notices pending. hub_get_notices returns full detail.
```

This is the right architectural answer, not a workaround. Hooks are the *push* channel and are budget-constrained by the platform; MCP is the *pull* channel and has no such limit. Pushing a pointer and letting the agent pull detail on demand is how the two surfaces are supposed to divide labor.

**Additional rules:**

- **Never put board state in `additionalContext`.** Board state belongs in `hub_get_board`. Push only deltas relevant to *this* session.
- **Compaction on the slow path.** More than four pending notices for one session → one Claude call collapses them into a single paragraph under 800 characters. Async, so latency is free.
- **Assert, don't hope.** `if (ctx.length > 4000) { drop lowest priority; log }`. A silent overflow is worse than a dropped notice, because you won't know it happened.

---

## 7. Data model

Freeze in Phase 0. All four write against it in parallel.

```ts
type ScopeLease = {
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

type Session = {
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
}

type Task = {
  id: string
  title: string
  area: 'frontend' | 'backend' | 'infra' | 'tests'
  suggestedPaths: string[]
  dependsOn: string[]       // powers sequencing
  status: 'open' | 'in_progress' | 'blocked' | 'done'
  claimedBy: string | null
}

type Contract = {
  id: string
  kind: 'http_route' | 'type' | 'component_prop' | 'env_var'
  name: string              // "POST /api/cart/items"
  definedIn: string
  consumedBy: string[]
  version: number
  lastChangedBy: string | null
}

type Notice = {
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

type TeamMemberProfile = {
  humanId: string
  rawContext: string        // what they pasted
  role: string
  strengths: string[]
  ownsAreas: string[]       // used by the adjudicator
  notes: string
}

type HubState = {
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
  hubHealth: { lastAdjudicationMs: number; degradedSessions: string[] }
}
```

All in memory. `rev` increments on every mutation; the board re-renders on change. Optionally append every mutation to one JSONL file — ten minutes, and it's the only route to a "the hub has seen this pattern before" story.

---

## 8. Conflict handling — three tiers

### Tier 1 — Prevention (deterministic, must ship)

Overlap on a held lease → deny with the canonical string from §6.1. Fast path only, in-memory, no model.

### Tier 2 — Coupling and sequencing (the differentiator, should ship)

**Contract drift.** A lease over a path that *defines* a contract → notices queued for every session holding a consumer path. Two agents in different files, about to break each other, warned before it happens. This is the failure git cannot see and the most defensible thing you build.

**Dependency sequencing.** When work is genuinely coupled, a lock just serializes, and serialization isn't coordination. Return `defer` instead of `deny`, record the dependency, and when the blocking lease releases, queue a notice carrying the new shape. Refusal becomes ordered handoff.

**Derive the contract registry, don't seed it.** A 20-line regex over `export` statements and route definitions at hub startup. "We derive the contract graph" beats "we hardcoded six entries" enormously in Q&A, for the same effort.

### Tier 3 — Semantic conflict (the wow; ship if the fast path is solid by 1:05)

One Claude call over every active session's `lastPrompt`, `intent`, held paths, and the context pack. Question: which pairs of these workstreams will produce incompatible results, even where they touch no common file?

The example it catches and nothing else does: agent A's intent is "add optimistic cart update," agent B's is "add loading spinner to add-to-cart." Different files. No lease conflict. Guaranteed fight over the same interaction state.

Fires on `Stop` and on lease grant, cached by intent-set hash.

### Deliberate non-goals — say these out loud

Not a merge engine; git still merges. Not a sandbox; agents write to a real shared tree. No rollback of bad agent output. No semantic diff of code.

---

## 9. MCP surface (secondary, and the overflow channel)

Remote MCP server over **Streamable HTTP** — stdio can't reach another machine. Two jobs: voluntary agent queries, and the notice overflow channel from §6.2.

| Tool | Purpose | Annotation |
| --- | --- | --- |
| `hub_get_notices` | Full detail when a push was budget-truncated | read-only |
| `hub_get_board` | Open tasks, active sessions with machine and intent, held scopes | read-only |
| `hub_claim_task` | Take a task, get `suggestedPaths` | not read-only |
| `hub_get_contract` | Current shape, version, consumers | read-only |
| `hub_send_note` | Message a teammate or the room | not read-only |
| `hub_release_scope` | Release early rather than waiting for TTL | not read-only |

`registerTool` with Zod `inputSchema`, an `outputSchema`, and `structuredContent` on responses. `hub_get_notices` is the only one that's load-bearing — it's the pressure valve for the 10k cap.

---

## 10. Context pack

No external API. At onboarding each person pastes freeform text — role, strengths, what they own, preferences. One Claude call parses it into `TeamMemberProfile`. A second field takes repo-level context: architecture, conventions, ownership.

**What it's for:** the adjudicator. When two sessions collide, "Maya owns the design system, Dev owns the API contracts" is what lets the hub resolve rather than merely refuse. Task-suggestion ordering is secondary.

Non-critical. `/onboard` is a separate route with a separate owner, and every profile lookup falls back to a default on any failure. **Acceptance test: delete the onboarding code and the demo still runs.**

---

## 11. Board

Priority #1 — it's what judges look at. Legible on a projector at 1280×720 from twenty feet.

**One lane per session**, horizontal. Header: human name, **machine hostname**, agent kind, colored dot, and an L0/L1 degraded badge when that session is running on cache.

Per lane: current task, held paths in mono, intent line, TTL bar, last three events.

**Center:** task board with dependency arrows, plus the feature being built and its build status.

**Bottom:** activity feed, newest first, colored by actor.

**Notice flash zone:** a denial or semantic-conflict notice takes over a large region for three seconds in its severity color, in full, readable from the back of the room. This is the moment the room sees the product work.

Dark background, two accents plus per-human colors, nothing under 16px, no controls, no login.

**Put one real terminal on screen beside the board.** The board is the aggregate; the proof is an agent *receiving* hub guidance and changing course. Without a visible terminal, judges will think you built a dashboard.

---

## 12. Stack and networking

| Layer | Choice |
| --- | --- |
| Language | TypeScript throughout |
| Hub | Node 20 + Express — hooks, MCP, board WS, one process |
| MCP | `@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport`, Zod |
| Board push | `ws`, full-state broadcast on `rev` change |
| Board UI | Vite + React, one `useState` |
| Adjudicator | One Anthropic API call, server-side, async, cached by intent hash |
| Fallback | jq + curl shell scripts, local JSON cache |
| Persistence | In memory, plus optional append-only JSONL |
| Auth | None |

**Forbidden:** CRDT libraries, Docker, a database, an ORM, auth providers, a deploy pipeline, a landing page, a settings panel.

**Networking — the #1 failure mode.** One laptop hosts. Bind `0.0.0.0`, not `localhost`. All machines on one phone hotspot or an ethernet switch, **not conference wifi**. `SB_HUB` in every shell profile and in `.claude/settings.json`. Fallback `ngrok http 8787`, tested in Phase 1, not Phase 5.

Run agents with `--dangerously-skip-permissions` for demo speed. `PreToolUse` hooks still fire in bypass mode, so hub enforcement survives — worth stating in Q&A because it sounds like it shouldn't be true.

`jq` must be installed on all four machines. Phase 0 check.

---

## 13. Phases

| Person | Owns |
| --- | --- |
| **A** | Hub state, fast path, overlap detection, TTL, notice queue + budget |
| **B** | Hook endpoints, `register.sh`, fallback scripts, **cross-machine networking** |
| **C** | Board + onboarding UI |
| **D** | Demo repo, task/contract seed, script, backup video, string review, rehearsal |

### Phase 0 — Freeze (0:00–0:10) · all four

- [ ] Repo cloned; `types.ts` from §7 pasted verbatim and pushed
- [ ] **`claude --version` on all four laptops — identical** (issue 6 gate)
- [ ] `jq --version` on all four
- [ ] `SB_HUB` and `SB_HUMAN` exported in every shell profile
- [ ] Hub host chosen, LAN IP shared
- [ ] One API key, one `.env`, one owner
- [ ] All four `curl http://$SB_HUB:8787/health` successfully

**DoD:** four successful curls plus four matching version strings.
**Fallback:** B owns networking exclusively; others work against localhost.

### Phase 1 — Skeleton (0:10–0:40)

**A:** `HubState`, `mutate(fn)` bumping `rev` and broadcasting, `/health`, `/leases/snapshot`. Overlap detection as a pure function with three tests: identical, nested, disjoint.

**B:** `/hooks/pre-edit` returning a hardcoded deny. `register.sh`. `.claude/settings.json` from §4 **with every timeout set**. Verify from a second machine.

**C:** Board with four hardcoded lanes, WS-connected, projector-legible from the start.

**D:** Demo repo — small React + Express cart app that builds. Five tasks from §14 with `dependsOn`. Contract deriver over `export` statements.

**DoD:** a real session on a second machine attempts an edit and is denied by the hardcoded response.
**Fallback:** if HTTP hooks misbehave, switch `PreToolUse` to command-only — exit 2 with the reason on stderr also blocks.

### Phase 2 — First light (0:40–1:05)

**A:** Real fast path — implicit lease creation, real denial with the §6.1 string, TTL, stale detection, notice queue with the §6.2 budget.

**B:** `/hooks/post-edit`, `/hooks/prompt` (captures intent), `/hooks/session-end`. Notice delivery via `additionalContext`. `fallback-check.sh` and `refresh-cache.sh`.

**C:** Lanes bound to real sessions with real held paths and hostnames.

**D:** Run two real sessions. **Confirm the denial is acted on rather than surfaced to the human.** If it's being surfaced, the copy is too imperative — fix per §6.1.

> ### 1:05 — HARD CHECKPOINT
>
> **Required:** two sessions, two physical machines, both on the board, one denied and visibly re-planning.
>
> **Record the backup video the moment this works.** No exceptions.
>
> Decide here: Tier 3? Onboarding? L2 git hook? Assign to whoever is ahead.

### Phase 3 — Intelligence and sequencing (1:05–1:30)

**A:** Async adjudicator. Contract-drift notices. `defer` + sequencing on `dependsOn`. Notice compaction.

**B:** `/hooks/post-bash` reporting build status. `Stop` hook triggering the semantic-conflict pass. `hub_get_notices` over MCP (the overflow channel — needed for §6.2 to be real).

**C:** **Notice flash zone.** Highest-value 20 minutes of UI work in the project.

**D:** Rehearse the collision. Know which two files, which two people, what they type. Rehearse reading the denial aloud.

**DoD:** two agents race one file, one is denied and re-plans; a contract notice fires between two agents in *different* files.

### Phase 4 — The ending (1:30–1:45)

**A:** TTL expiry frees leases and returns tasks. Build status on the board.

**B:** Kill a session; confirm the lease frees within 10 seconds. **Then kill the hub and confirm L1 still denies a cached-held path.** That test is the demo beat for §5.

**C:** Final projector pass. Feature-status panel. Degraded badge.

**D:** **Verify the five tasks actually compose into a working feature.** Reload the browser; the variant selector must work. This is the ending — it has to be real.

### Phase 5 — Rehearse (1:45–2:00) · all four

- [ ] Full run-through on real hardware, out loud, twice
- [ ] Backup video plays on the presentation machine
- [ ] Terminals pre-`cd`'d, tabs pre-opened, hub running
- [ ] **Every agent-facing string reviewed against §6.1**
- [ ] Judge notes (§16) assigned to specific people
- [ ] No code after 1:50

### Roadmap slide only — do not build

Enforced mode via permission rules rather than advisory hooks; contention management (§17); branching — fork the plan, run two approaches, merge the winner; cross-session memory so lease history becomes the team's playbook; automatic PR splitting per lease; agent-to-agent lease negotiation without hub arbitration; persistence and replay; permissions and roles; multi-repo; mobile approval of deferred leases.

---

## 14. Demo — ends on a shipped feature

Demo repo is a cart page. The live goal is a **size variant selector**.

| Task | Area | Paths | Depends on |
| --- | --- | --- | --- |
| T-01 | backend | `api/routes/cart.ts`, `api/types.ts` | — |
| T-02 | frontend | `web/src/components/VariantPicker.tsx` | T-01 |
| T-03 | frontend | `web/src/components/Cart/CartItem.tsx` | T-02 |
| T-04 | frontend | `web/src/components/Cart/CartItem.tsx` | — |
| T-05 | tests | `tests/fixtures/cart.ts` | T-01 |

T-03 and T-04 collide on one real file, on purpose. T-01 defines a contract T-02 and T-05 consume. Exactly one collision, at a known moment — which is also the mitigation for issue 8 in demo conditions (§17).

**Script, ~100 seconds:**

**0:00** — "Four of us. Four coding agents. One repo. One feature. Watch."

**0:10** — Four sessions start. Four lanes appear with four different hostnames. Say the hostnames out loud.

**0:20** — Everyone dispatches. Lanes fill with real intents and real held paths.

**0:35 — Tier 1.** T-03 and T-04 race `CartItem.tsx`. Denial flashes. Read it aloud. The denied agent takes a free sibling path and keeps working.

**0:50 — Tier 2.** T-01's agent claims the routes file. A contract notice fires to the T-02 agent. "Different files. Nothing conflicts in git. The build would have broken."

**1:05 — Tier 3.** The semantic-conflict notice fires on two intents that share no file at all.

**1:20 — The ending.** Reload the browser. **The variant selector works.** Four agents, four machines, one feature, no conflicts, under two minutes.

**1:30** — "Every parallel-agent tool today runs N agents on one machine for one person. This coordinates four people's agents on one codebase. That's Multiplayer AI for the work engineers actually do."

**Optional beat if time allows:** kill the hub mid-demo and show L1 still refusing a cached-held path. Costs 10 seconds and pre-empts the availability question entirely.

Rules: no architecture narration during the demo, no slides before it, nobody touches a keyboard off-cue.

---

## 15. Risk register

| # | Risk | Likelihood | Mitigation |
| --- | --- | --- | --- |
| 1 | Cross-machine networking fails | **High** | Hotspot, `0.0.0.0`, ngrok tested in Phase 1 |
| 2 | Denial text surfaced to human instead of acted on | **Medium-high** | §6.1 copy rules; D tests at 0:40; Phase 5 string review |
| 3 | Hub unreachable mid-demo | Medium | L1 cache fallback (§5); also a demo beat |
| 4 | Demo fails live | Medium | Video recorded at 1:05 |
| 5 | Adjudicator latency drags pacing | Medium | Async only, never in the fast path, cached |
| 6 | Notice overflow silently swallows a blocking notice | Medium | 4,000-char budget, priority ordering, assert-and-log (§6.2) |
| 7 | Contention thrash under load | Medium | Engineered task seed for the demo; open problem for the product (§17) |
| 8 | Tasks don't compose into a feature | Medium | D verifies in Phase 4 — this is the ending |
| 9 | Version or `jq` skew across laptops | Low after Phase 0 | Phase 0 gate |
| 10 | Scope creep | Medium | §12 forbidden list; phase DoDs binding |
| 11 | Hub restart wipes state | Low | Accept; keep a 20-second reseed script |

---

## 16. Notes for judges — assign each to a person

These are the answers we want to volunteer rather than be caught by.

**On availability and fail-open.** "HTTP hooks fail open by platform design — if our hub is unreachable, the edit proceeds. We'd choose that even if we could change it: a coordination plane sits in the write path of every edit, and it must never be able to brick four engineers. So instead of pretending we have hard enforcement, we degrade in tiers. Live hub is authoritative. Hub down, a local cache still blocks paths known held in the last ninety seconds. Beyond that, a git pre-commit hook catches it before anything is shared. Hard enforcement via permission rules is on the roadmap, as an opt-in for teams who want it."

**On designing for agent consumption.** "We found something we didn't expect. Writing infrastructure that talks *to an agent* is its own discipline. Our first version phrased denials as instructions — 'do not edit this file' — and the agent treated it as a possible prompt injection and showed the text to its human instead of acting on it. So we rewrote the whole protocol as factual statements of state: here's who holds this, here's their intent, here's what's free. State, not commands. That's a design constraint nobody documents yet, and we think anyone building agent-facing infrastructure hits it."

**On the intelligence.** "The fast path is deliberately dumb — a lock has to be instant, so it's an in-memory set check under fifty milliseconds. The judgment runs asynchronously: adjudicating whether two colliding intents are actually incompatible or just co-located, and detecting conflicts between workstreams that share no file at all. That last one is only possible with a model, and it's what we'd build the company on."

**On the shared working tree.** "Sharing one tree is our stress case, because it's where conflicts are hardest. The real product coordinates intent and contracts across separate workspaces, and every mechanism here works identically when the paths live in four different checkouts."

**On what already exists.** "Worktrees and parallel-agent runners are all single-operator, single-machine, and most work by *isolating* agents into separate trees — preventing collision by preventing collaboration. Nothing coordinates several different people's live sessions against one shared tree, and nothing does contract-level warning across sessions." *(Search for current competitors before the demo and name your closest one precisely. Naming it is a credibility win; being surprised by it is fatal.)*

**On git.** "Git operates on committed state. Agents cause damage in the working tree, minutes before a commit exists. And branches never tell agent B that agent A is about to change the route it consumes."

**On enforcement under bypass.** "Agents can't skip the hook. `PreToolUse` fires before every edit, including under `--dangerously-skip-permissions`, which surprises most people."

**On the business.** "Per-seat for teams running multiple agents, which is every engineering org within eighteen months. The moat is lease history — nobody else has a record of how a team's humans and agents actually divide work."

**On cuts.** "Persistence, auth, multi-repo, hard enforcement, and contention management. We'd rather name them than have you find them."

---

## 17. Known open problems

Stated for judges deliberately. A team that can articulate its product's limits reads as more credible than one that claims none.

### 17.1 Contention thrash (unsolved)

**The problem.** With four agents on a small codebase, heavy contention produces a denial storm: agents repeatedly refused, re-planning, colliding again. Serialization is not coordination, and a lock that fires constantly is a worse experience than no lock.

**What we did for the demo.** Engineered the task seed so exactly one collision occurs, at a known moment. That's honest scoping, not a fix.

**What we believe the real answer looks like**, in rough order of confidence:

1. **`defer` over `deny` as the default.** Queue the edit and release it when the blocking lease drops, rather than refusing and forcing a re-plan. Turns contention into latency instead of churn. Partially implemented for `dependsOn` cases; should become general.
2. **Finer granularity.** File-level locking is wrong in both directions — it forbids two agents safely editing different functions in one file, and barely catches cross-file breakage. Symbol- or export-level claims would cut contention sharply.
3. **Contention-aware dispatch.** The hub already knows the dependency graph and who holds what. It should assign work to *minimize* predicted overlap rather than reacting to collisions after the fact. The adjudicator has the context to do this; we ran out of time.
4. **Backpressure.** Above a contention threshold, the hub tells a session to pause rather than thrash — the equivalent of a scheduler parking a starved thread.

**Honest assessment:** #1 and #3 are the ones we'd build next, and until they exist, Switchboard is more valuable on a large codebase with wide separation than a small one with dense coupling. Worth saying plainly.

### 17.2 Enforcement is advisory, not guaranteed

Covered in §5 and §16. The hard-enforcement path exists (permission rules rather than hooks) and is a deliberate roadmap item rather than an oversight.

### 17.3 Lease granularity vs. false denials

File-level leases will refuse work that would have been safe. We have no measurement of how often. Instrumenting the false-denial rate is the first thing we'd add post-hackathon, because it's the number that tells us whether granularity is the priority.

---

## 18. Definition of done — you may demo if and only if

- [ ] Two or more sessions on **two or more physical machines** on one board
- [ ] An edit creates a lease with **no agent cooperation required**
- [ ] A second agent is **denied** and visibly re-plans
- [ ] A contract notice fires between agents in **different files**
- [ ] A dead session's lease frees and its task returns
- [ ] **Hub killed → L1 cache still denies a known-held path**
- [ ] **The feature actually works in the browser at the end**
- [ ] Backup video plays on the presentation machine
- [ ] Every agent-facing string is factual, not imperative
- [ ] Someone can say the differentiator sentence in one breath
