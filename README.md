# Roster — your AI workforce

Index your GitHub repo, calibrate an HQ that routes work the way your team
actually works, and put **real coding agents** to work on your machines — with
every decision and every file edit visible live on a company dashboard.

```
┌───────────────────────── CLOUD (Vercel + Supabase) ─────────────────────────┐
│  landing · auth · onboarding · dashboard                                    │
│  HQ engine: routes requests → agents, cites real repo evidence, remembers   │
│  Postgres: orgs · members · profiles · events · tasks · runners (RLS-locked)│
└──────────────┬──────────────────────────────────────────▲──────────────────┘
        tasks  ▼                                          │  live activity
┌─────────────────────── LOCAL RUNNER (your machine) ─────┴──────────────────┐
│  roster-runner: claims tasks → spawns your own `claude` CLI in the repo    │
│  you pointed it at → streams every real tool action back up                │
└────────────────────────────────────────────────────────────────────────────┘
```

## Layout

| Path | What |
| --- | --- |
| `web/` | The Next.js app — landing (`/`), auth (`/login`), onboarding (`/onboarding`, `/join`), dashboard (`/dashboard`), and the whole API |
| `runner/` | `roster-runner` CLI — executes tasks with real Claude Code sessions |
| `supabase/migrations/` | Schema, applied with `npm run db:migrate` (from `web/`) |

## Run it locally

```bash
cd web
cp .env.example .env.local          # fill in Supabase + provider values
npm install
npm run db:migrate                  # applies supabase/migrations/*
npm run dev                         # http://localhost:3000
```

Flow: sign up at `/login` → create your company at `/onboarding` → index a
GitHub repo (~10–60s) → you get an invite code → teammates sign up and join at
`/join` → everyone lands on the same live dashboard.

## Put a real agent to work

```bash
# 1. Mint a runner token (signed in): POST /api/runners, or from the dashboard.
# 2. On any machine with Claude Code installed and signed in:
cd runner && npm install
npx tsx src/index.ts start \
  --hub https://your-deployment.vercel.app \
  --token rt_... \
  --repo ~/work/the-repo-agents-should-edit
```

The runner only ever works inside the git repo you point it at
(`--permission-mode acceptEdits` by default). Type a request into the dashboard
terminal — HQ routes it, a task is queued, the runner picks it up, a real
Claude session does the work, and every edit streams to the dashboard.

## Verify

```bash
cd web
npm test          # engine unit tests (offline)
npm run e2e       # full stack against a running server — auth, orgs, invite
                  # join, org isolation, indexing, HQ, and a REAL agent session
                  # in a scratch repo. E2E_SKIP_AGENT=1 skips the agent step.
```

## Security model

- Every table has **RLS enabled with zero policies** — browsers cannot touch
  data even with the anon key. The only data path is the API, which resolves
  the org from the session (or runner token) server-side and queries Postgres
  directly through the Supabase pooler.
- Runner tokens are shown once and stored **hashed**; runners can only claim
  and update tasks inside their own org.
- Supabase Auth handles identity only. Sign-ups currently require email
  confirmation (project setting) — see Operational notes.

## Operational notes

- **Email confirmation + default SMTP**: the Supabase project has confirmation
  ON with Supabase's built-in mailer, which is rate-limited to a handful of
  emails per hour — real sign-ups will stall. Either disable "Confirm email"
  (Supabase → Auth → Providers → Email) or configure custom SMTP before
  launch.
- **Model provider**: HQ and profile derivation call an OpenAI-compatible
  endpoint (NVIDIA NIM by default). Every model path is bounded and degrades
  to a deterministic engine that still cites real repo evidence — the product
  works fully with no model reachable. `HQ_MODEL_ENABLED=false` skips model
  calls outright.
- The hackathon-era projects (Switchboard hub, roster/, hackathon-ui/,
  orchestra/) were consolidated into `web/` + `runner/`; their full history is
  in git before the "production consolidation" commit.
