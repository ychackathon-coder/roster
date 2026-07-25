# Switchboard — hub

Coordination hub for several people's coding agents against one repo. See
[FINAL_SPEC.md](./FINAL_SPEC.md) for the full design; every module cites the
section it implements.

**This repo is the backend.** The board UI and the demo repo are separate
workstreams — see [What this repo does not contain](#what-this-repo-does-not-contain).

---

## Run it locally (recommended)

```bash
npm install
npm start          # or: npm run dev  (watch mode)
```

Prints the LAN address to share with the room:

```
  Switchboard hub listening on 0.0.0.0:8787
  store: memory
  Share this with the room (§13 Phase 0):
    export SB_HUB=192.168.12.30
```

No `.env` required. With no `ANTHROPIC_API_KEY` the hub runs in **deterministic
mode**: fast path, contract drift, sequencing, TTL, and L1 all work; the
adjudicator and semantic-conflict pass go quiet.

## Verify it

```bash
npm test           # 69 unit tests
npm run verify     # 24 end-to-end checks against a running hub, idempotent
npm run verify:l1  # 9 degraded-mode checks — the §18 "hub killed" line
```

`verify.sh` reproduces the §14 collision using the exact payloads Claude Code
sends, so it works before any real session exists.

---

## Install the client into the demo repo

Hook config belongs in the **demo repo**, not here (§4: committed so every session
picks it up on clone).

```bash
export SB_HUB=192.168.12.30                     # a laptop hub
#   …or…
export SB_HUB_URL=https://your-hub.vercel.app   # a deployed hub

./client/install.sh /path/to/demo-repo
```

Each person also needs `SB_HUMAN=TheirName` exported, plus `jq` installed.

### Mixed Claude Code versions are supported

§4 required an identical version on all four laptops and gated it in Phase 0.
**That gate is gone.** Two mechanisms replace it:

1. **Two client modes.** `install.sh` picks automatically, or force one with
   `--mode http|command`.

   | Mode | Mechanism | When |
   | --- | --- | --- |
   | `http` | `type: "http"` hooks | Faster. Needs a version with HTTP hook support (~2.1.190+) |
   | `command` | curl via command hooks, blocks with `exit 2` | **Works on every hook-era version.** One process spawn per event |

   `auto` chooses `command` whenever it cannot prove the local version supports
   HTTP hooks — because guessing wrong the other way means that session has *no
   enforcement at all*, silently.

2. **Dual-shape responses.** Every denial is emitted in both the current
   envelope (`hookSpecificOutput.permissionDecision`) and the older one
   (top-level `decision`/`reason`). A version that understands one ignores the
   other. This matters because an unparseable hook response fails **open**.

The hub records each session's version and sets `hubHealth.versionSpread` when
they differ, so the board can show a badge. Nothing is ever blocked for it.

---

## Where to run it

See **[HOSTING.md](./HOSTING.md)** for the full comparison. Short version:

| Option | Card? | Verdict |
| --- | --- | --- |
| **Laptop + `.local` hostname** | no | **Recommended.** ~1–5ms per edit, nothing to install, immune to the hub's IP changing. The original §12 design |
| Phone hotspot | no | Same, for when venue wifi isolates clients from each other |
| Tailscale | no | Free for 6 users / unlimited devices. Relays around client isolation, and removes the public-exposure problem entirely |
| ngrok | no | Permanent `*.ngrok-free.dev` domain. 1 agent, 20K req/month |
| Cloudflare quick tunnel | no | Rate-limited per IP; the reliable named tunnel needs a Cloudflare domain |
| Fly / Render paid | **yes** | Only if the hub must outlive the host laptop. Contract derivation becomes manual |
| Vercel | no | Works, worst fit — needs Redis, no WebSocket, lock fails open |

```bash
# hub laptop
npm start

# every other laptop — use the HOSTNAME, not the IP
export SB_HUB=Anshs-MacBook-Air.local     # `hostname -s` on the hub, plus .local
export SB_HUMAN=TheirName
./lan-check.sh                            # Phase 0 gate, run on EACH laptop
```

The IP changes when the hub rejoins wifi and silently points every teammate's
hooks at nothing — and hooks fail *open*, so edits proceed unenforced with no
error. The mDNS hostname follows the machine.

## Deploy to Vercel

A public URL eliminates §15's highest-likelihood risk — cross-machine networking,
hotspots, LAN IPs, and ngrok all go away. It costs latency and needs a state
store.

### 1. A Redis store is mandatory

Serverless instances don't share memory, so without a store two agents can both
be granted the same file. Add **Upstash Redis** (Vercel Marketplace, free tier) or
Vercel KV, then set either pair:

```
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
KV_REST_API_URL       / KV_REST_API_TOKEN
```

The hub logs a loud error at boot if it's on Vercel with no store.

### 2. Deploy

```bash
vercel            # preview
vercel --prod
```

`vercel.json` rewrites every path to `api/index.ts`, which re-exports the same
Express app the local hub uses — one implementation, not two.

### 3. Push the contract registry

A deployed hub cannot read anyone's filesystem, so §8 Tier 2 contract drift needs
the registry pushed once (and again whenever the demo repo's exports change):

```bash
npm run derive-contracts -- /path/to/demo-repo https://your-hub.vercel.app
```

Skip this and contract drift silently never fires.

### 4. Point clients at it

```bash
export SB_HUB_URL=https://your-hub.vercel.app
./client/install.sh /path/to/demo-repo
```

### What behaves differently on Vercel

| | Local hub | Vercel |
| --- | --- | --- |
| Hub handler time | **under 1ms** | under 1ms + two Redis round trips |
| Round trip the agent feels | ~1–5ms on a LAN | ~40–150ms |
| Board feed | `ws://…/board` | `GET /state` polling, or `/board/sse` with reconnects |
| Contract derivation | automatic at boot | `npm run derive-contracts` |
| TTL expiry | timer + per-request | per-request only (no traffic → no expiry) |
| Slow path | `setImmediate` | Vercel `waitUntil` |
| Mutation safety | single process | short Redis lock, **fails open** |

**No WebSocket.** There is no process to hold a socket open. The board should
poll `GET /state`; `/board/sse` works but a serverless function has a hard
duration cap, so the stream will be cut and `EventSource` must reconnect.

**No auth (§12).** On a LAN that's fine. On a public URL, anyone with the link can
read the board — including everyone's prompts and recorded intents — and can claim
tasks, release leases, or reset state. Consider a shared-secret header before you
put real work through it.

---

## What's built

| Area | Module | Spec |
| --- | --- | --- |
| Data model, frozen | `src/types.ts` | §7 |
| State, `rev`, broadcast | `src/state.ts` | §7 |
| Path overlap + cross-machine reconciliation | `src/overlap.ts` | §13 P1 |
| Fast path, leases, TTL | `src/leases.ts` | §1, §3 |
| Agent-facing strings + linter | `src/strings.ts` | §6.1 |
| Notice queue + budget | `src/notices.ts` | §6.2 |
| Hook endpoints | `src/hooks.ts` | §4 |
| Cross-version responses | `src/compat.ts` | — |
| Contract deriver | `src/contracts.ts` | §8 T2 |
| Adjudicator, semantic pass | `src/slow.ts` | §3, §8 T3 |
| MCP surface, 6 tools | `src/mcp.ts` | §9 |
| Board websocket | `src/board.ts` | §11 |
| State store (memory / Redis) | `src/store.ts` | — |
| App shared by both entries | `src/app.ts` | §12 |
| L1 fallback scripts | `client/.claude/hooks/` | §5 |

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/hooks/session-start` | Registration; returns seeded context + records version |
| POST | `/hooks/pre-edit` | **The fast path.** Implicit lease, deny, defer |
| POST | `/hooks/post-edit` | Edit count, notice delivery |
| POST | `/hooks/post-bash` | Build status from exit codes |
| POST | `/hooks/prompt` | Intent capture from `UserPromptSubmit` |
| POST | `/hooks/turn-end` | `Stop` — triggers the semantic pass |
| POST | `/hooks/session-end` | Frees leases, returns tasks |
| GET | `/leases/snapshot` | L1 cache source, carries `fetchedAt` |
| GET | `/health` | Phase 0 gate |
| GET | `/state` | Board bootstrap and serverless polling feed |
| GET | `/board/sse` | SSE board feed |
| WS | `/board` | Full-state push (local hub only) |
| POST | `/mcp` | Streamable HTTP MCP |
| POST | `/contracts` | Accept an externally derived registry |
| POST | `/onboard` | §10 context pack (deletable by design) |
| POST | `/repo-context` | Repo-level context for the adjudicator |
| POST | `/admin/reset` | 20-second reseed (§15 risk 11) |

---

## For the board workstream

Connect to `ws://$SB_HUB:8787/board` locally, or poll `GET /state` on a deployed
hub. Every message is:

```json
{ "type": "state", "state": { /* the entire HubState from §7 */ } }
```

Full state on every change — no deltas to reconcile. One `useState`, replace it
wholesale.

Fields most relevant to §11: `sessions` (one lane each, with `machine`, `color`,
and `claudeVersion`), `leases` (filter `status === 'held'`; `expiresAt` drives the
TTL bar), `tasks` (`dependsOn` powers the dependency arrows), `activity` (newest
first, capped at 200), `notices` (flash zone off `severity === 'block'`),
`buildStatus`, `hubHealth.degradedSessions` for the L0/L1 badge, and
`hubHealth.versionSpread` for the mixed-version badge.

---

## Deviations from the spec

**1. `defer` is sent on the wire as `deny`.** §3 step 5 returns
`permissionDecision: "defer"`, but the platform enum is `allow | deny | ask`, and
an unparseable response fails *open*. Product behavior is unchanged: refused now,
a `deferred` lease records the dependency, a notice carrying the new shape is
pushed when the blocker releases. One constant — `DEFER_WIRE_DECISION` in
`src/hooks.ts` — flips it back. **Unverified against your version; confirm before
the demo.**

**2. No pronouns in agent-facing strings.** §6.1's example reads "Her recorded
intent is…". These render with real teammates' names and the hub never learns
anyone's pronouns, so it emits "Recorded intent is…".

**3. The identical-version gate is removed.** See
[Mixed Claude Code versions](#mixed-claude-code-versions-are-supported).

**4. Two optional additions to §7's frozen model** — `Session.claudeVersion` and
`HubHealth.versionSpread`. Both optional, so code written against §7 is unaffected.

**5. Persistence is pluggable.** §12 says in-memory and forbids a database. Memory
remains the default and the local hub is unchanged; Redis exists only because
serverless makes in-memory state incorrect rather than merely limited.

---

## What this repo does not contain

- **The board UI** (§11) — consumes the feed above
- **The demo repo** (§14) — the cart app with the five seeded tasks. `src/seed.ts`
  has the task graph; the app itself is a separate workstream
- **The onboarding form** (§10) — `POST /onboard` takes `{humanId, rawContext}`;
  per §10 the demo must run without it

## Phase 0 checklist (§13, revised)

- [x] `types.ts` pushed
- [x] ~~Identical `claude --version` on all four laptops~~ — no longer required
- [ ] `jq --version` on all four laptops
- [ ] `SB_HUB` (or `SB_HUB_URL`) and `SB_HUMAN` in every shell profile
- [ ] Hub chosen: a laptop on the LAN, or deployed
- [ ] One API key, one owner (optional — deterministic mode works without)
- [ ] `curl <hub>/health` from **each** laptop
- [ ] If deployed: Redis configured, and `derive-contracts` pushed

## Person D Roster (onboarding)

Next.js onboarding + repo indexing lives in [`roster/`](./roster/). See `roster/DEMO_SCRIPT.md` and `roster/PROGRESS.md`.

```bash
cd roster && npm install && npm run seed && npm run dev
```
