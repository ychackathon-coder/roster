# Roster — Person D (Onboarding / Repo Indexing)

Calibrates HQ from a real public GitHub repo, seeds shared memory events in Supabase, and provides a mock HQ + terminal harness for isolation testing.

## Run locally

```bash
cd roster
cp .env.example .env.local   # fill NVIDIA_* + Supabase keys
npm install
npm run seed                 # writes seeded events to Supabase (or local JSON)
npm run dev                  # http://localhost:3456
```

## Env vars (also set these on Vercel if deploying this app)

| Var | Required for deploy? |
|---|---|
| `NVIDIA_API_KEY` | yes |
| `NVIDIA_BASE_URL` | yes (`https://integrate.api.nvidia.com/v1`) |
| `NVIDIA_MODEL` | yes (`meta/llama-3.3-70b-instruct`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` | yes |
| `DATABASE_URL` / `DATABASE_URL_POOLER` | **no** — local migrate only |

## Integration with the dashboard (Person C)

1. Call `POST /api/index-repo` with `{ "repo": "owner/name" }` → Team Profile
2. On confirm, redirect to the dashboard (today: `/terminal` mock)
3. Dashboard reads live rows from Supabase `events` (`GET /api/events`)

See `DEMO_SCRIPT.md` and `PROGRESS.md`.

## HQ — the real decision engine

`POST /api/hq` is no longer the mock. See **[HQ_HANDOVER.md](./HQ_HANDOVER.md)**.

```bash
npm test              # 20 unit tests — offline, no API key needed
npm run dev           # terminal 1
npm run verify:hq     # terminal 2 — 16 end-to-end checks, idempotent
npm run db:migrate    # applies events + team_profiles
```

Three layers: a model decision, one corrective retry, then a deterministic floor
that quotes a trait verbatim. **The whole thing runs with no API key** — without
one, the floor answers and still cites real detail.

The handover's hard requirement (every response must cite a concrete detail from
`profile.traits`, never just the archetype label) is **enforced in code** by
`src/lib/specificity.ts`, not merely requested in a prompt. Responses that cite
nothing real are rejected and retried.

Extra env vars, all optional:

| Var | Purpose |
| --- | --- |
| `HQ_API_KEY` | Override the model provider for HQ only. Defaults to `NVIDIA_API_KEY` |
| `HQ_BASE_URL` | Any OpenAI-compatible endpoint. Defaults to `NVIDIA_BASE_URL` |
| `HQ_MODEL` | Defaults to `NVIDIA_MODEL` |

⚠ **Reseed before the real demo run:** `npm run seed`. Every request writes an
event, so rehearsals accumulate and the memory callback can end up matching a
rehearsal instead of the seeded history.
