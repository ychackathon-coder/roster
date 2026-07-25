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
