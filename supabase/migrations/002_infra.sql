-- Infrastructure hardening: migration bookkeeping + API rate limiting.

-- Which migrations have been applied (db-migrate reads/writes this and skips
-- already-applied files instead of re-running everything on convention).
create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;

-- Fixed-window rate limiting, shared across serverless instances. One row per
-- (key, window); count bumps atomically via upsert.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Windows are transient; anything old is garbage.
create index if not exists rate_limits_window on public.rate_limits (window_start);
