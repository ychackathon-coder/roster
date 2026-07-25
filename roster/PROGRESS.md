# Person D Progress Log

## Assumptions
- Built Roster Person D scope from attached plans in this workspace (legacy Switchboard hub scaffold replaced by Next.js app).
- No Supabase credentials → `data/events.json` matching §4.3; set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to switch.
- Profile derivation uses NVIDIA NIM (`meta/llama-3.3-70b-instruct` via OpenAI SDK), not Anthropic.
- Fallback repos: `chalk/chalk`, `sindresorhus/is`, `expressjs/morgan`.
- Dev server pinned to **http://localhost:3456** (port 3000 occupied by another Clerk app).

## Step status
| Step | Status | Notes |
|---|---|---|
| 1 Indexing | PASS | Real GH + Claude; chalk vs is clearly different + specific |
| 2 Onboarding | PASS | `/` input + 3 cards + loading + confirmation; E2E 200 |
| 3 Seeded memory | PASS | 2 rows queryable via `/api/events` (local-json) |
| 4 Mock HQ + terminal | PASS | `/terminal` + `/api/hq`; memory match + spawn verified |
| 5 Demo script notes | PASS | `DEMO_SCRIPT.md` — live chalk/chalk, cached is fallback |

## Step 1
- Ran `npm run test:index` against chalk/chalk + sindresorhus/is
- chalk traits cite WezTerm/Ghostty true-color commits; is cites predicate commits
- Cached: `data/cached-profiles/`
- Workaround: proxy 401 → official Anthropic; model id fix

## Step 2
- Built onboarding at `/` with URL input, fallback cards, loading, confirmation → `/terminal`
- Verified `POST /api/index-repo` with chalk/chalk returns specific profile + calibration event

## Step 3
- Supabase connected: project `hozfymuejlnidimzplpm`
- Created `public.events` + open RLS via pooler (`aws-0-us-east-2`, direct `db.*` is IPv6-only here)
- `npm run seed` → supabase backend with `evt-seed-sales-onepager`, `evt-seed-ops-vendor`
- `/api/events` reads from Supabase

## Step 4
- Mock HQ implements §5.4: cites profile detail; memory match on one-pager request; `spawn_new` for compliance/MSA
- Minimal terminal at `/terminal` polls events every 2s

## Step 5
- Checklist in `DEMO_SCRIPT.md`
- Primary live: chalk/chalk (stable in rehearsal)
- Cached fallback: sindresorhus/is

## Cuts
- None required. Stretch (per-contributor indexing) not attempted — cut order item 1 by design after must-haves.

## How to run
```bash
npm install
npm run seed
env -u ANTHROPIC_BASE_URL -u ANTHROPIC_AUTH_TOKEN npm run dev
# http://localhost:3456
```
