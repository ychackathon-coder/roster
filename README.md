# Switchboard — hub

Coordination hub for several people's coding agents against one repo. See
[FINAL_SPEC.md](./FINAL_SPEC.md) for the full design; every module here cites the
section it implements.

**This repo is the backend.** The board UI and the demo repo are separate
workstreams — see [What this repo does not contain](#what-this-repo-does-not-contain).

---

## Run it

```bash
npm install
npm start          # or: npm run dev  (watch mode)
```

On boot it prints the LAN address to share with the room:

```
  Switchboard hub listening on 0.0.0.0:8787
  Share this with the room (§13 Phase 0):
    export SB_HUB=192.168.12.30
```

No `.env` is required. With no `ANTHROPIC_API_KEY` the hub runs in **deterministic
mode**: the fast path, contract drift, sequencing, TTL, and L1 all work; the
adjudicator and semantic-conflict pass go quiet. Copy `.env.example` to `.env` to
turn those on.

## Verify it

```bash
npm test          # 51 unit tests
./verify.sh       # 24 end-to-end checks against a running hub, idempotent
./l1-verify.sh    # 9 degraded-mode checks — the §18 "hub killed" line
```

`verify.sh` reproduces the §14 collision using the exact payloads Claude Code
sends, so it works before any real session exists.

## Install the client into the demo repo

The hook config belongs in the **demo repo**, not here (§4: committed so every
session picks it up on clone).

```bash
export SB_HUB=192.168.12.30      # the hub host's LAN IP
./client/install.sh /path/to/demo-repo
```

That copies the three hook scripts, substitutes `$SB_HUB` into
`.claude/settings.json`, and gitignores the L1 cache. Re-run it if the hub moves
machines.

---

## What's built

| Area | Module | Spec |
| --- | --- | --- |
| Data model, frozen | `src/types.ts` | §7 |
| State, `rev`, broadcast | `src/state.ts` | §7 |
| Path overlap | `src/overlap.ts` | §13 P1 |
| Fast path, leases, TTL | `src/leases.ts` | §1, §3 |
| Agent-facing strings + linter | `src/strings.ts` | §6.1 |
| Notice queue + budget | `src/notices.ts` | §6.2 |
| Hook endpoints | `src/hooks.ts` | §4 |
| Contract deriver | `src/contracts.ts` | §8 T2 |
| Adjudicator, semantic pass | `src/slow.ts` | §3, §8 T3 |
| MCP surface, 6 tools | `src/mcp.ts` | §9 |
| Board websocket | `src/board.ts` | §11 |
| L1 fallback scripts | `client/.claude/hooks/` | §5 |

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/hooks/session-start` | Registration from `register.sh`; returns seeded context |
| POST | `/hooks/pre-edit` | **The fast path.** Implicit lease, deny, defer |
| POST | `/hooks/post-edit` | Edit count, notice delivery |
| POST | `/hooks/post-bash` | Build status from exit codes |
| POST | `/hooks/prompt` | Intent capture from `UserPromptSubmit` |
| POST | `/hooks/turn-end` | `Stop` — triggers the semantic pass |
| POST | `/hooks/session-end` | Frees leases, returns tasks |
| GET | `/leases/snapshot` | L1 cache source, carries `fetchedAt` |
| GET | `/health` | Phase 0 gate |
| GET | `/state` | Board bootstrap before the websocket attaches |
| WS | `/board` | Full-state push on every `rev` change |
| POST | `/mcp` | Streamable HTTP MCP |
| POST | `/onboard` | §10 context pack (deletable by design) |
| POST | `/admin/reset` | 20-second reseed (§15 risk 11) |

---

## For the board workstream

Connect to `ws://$SB_HUB:8787/board`. Every message is:

```json
{ "type": "state", "state": { /* the entire HubState from §7 */ } }
```

Full state on every change — no deltas to reconcile. One `useState`, replace it
wholesale. `GET /state` gives the same object over HTTP for the first paint.

Fields most relevant to §11's layout: `sessions` (one lane each, with `machine`
and `color`), `leases` (filter `status === 'held'` for held paths, `expiresAt` for
the TTL bar), `tasks` (`dependsOn` powers the dependency arrows), `activity`
(newest first, already capped at 200), `notices` (drive the flash zone off
`severity === 'block'`), `buildStatus`, and `hubHealth.degradedSessions` for the
L0/L1 badge.

---

## Two deliberate deviations from the spec

**1. `defer` is sent on the wire as `deny`.** §3 step 5 returns
`permissionDecision: "defer"`, but Claude Code's enum accepts only
`allow | deny | ask`. Emitting `defer` risks an unparseable hook response, and an
unparseable response fails *open* — granting the edit. The product behavior §8
asks for is unchanged: the edit is refused now, a `deferred` lease records the
dependency, and a notice carrying the new shape is pushed when the blocker
releases. Only the wire value differs. See `DEFER_WIRE_DECISION` in
`src/hooks.ts`. **Worth confirming against your Claude Code version before the
demo** — if `defer` is in fact accepted, flip that one constant.

**2. No pronouns in agent-facing strings.** §6.1's canonical denial reads "Her
recorded intent is…". These strings render with real teammates' names and the hub
never learns anyone's pronouns, so it emits "Recorded intent is…" instead. Same
information, no chance of misgendering someone on the team.

---

## What this repo does not contain

- **The board UI** (§11) — consumes the websocket above
- **The demo repo** (§14) — the cart app with the five seeded tasks. `src/seed.ts`
  has the task graph; the app itself is a separate workstream
- **The onboarding form** (§10) — `POST /onboard` accepts `{humanId, rawContext}`;
  the UI is not built, and per §10 the demo must run without it

## Phase 0 checklist (§13)

- [ ] `types.ts` pushed — **done**, this repo
- [ ] `claude --version` identical on all four laptops (built against **2.1.220**)
- [ ] `jq --version` on all four
- [ ] `SB_HUB` and `SB_HUMAN` in every shell profile
- [ ] Hub host chosen, LAN IP shared
- [ ] One API key, one `.env`, one owner
- [ ] `curl http://$SB_HUB:8787/health` from **each** laptop
