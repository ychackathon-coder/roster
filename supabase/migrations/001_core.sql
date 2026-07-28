-- Roster production schema v1.
--
-- SECURITY MODEL: every table has RLS enabled with NO policies. That is
-- deliberate — anon/authenticated roles can touch nothing directly, so the
-- browser's only path to data is our API, which authenticates the Supabase
-- session and connects to Postgres as the owner role (bypasses RLS). Supabase
-- Auth is used for identity only. If Realtime is added later, add narrow
-- SELECT policies then.
--
-- Drops the hackathon tables: they held only demo junk and had world-open
-- policies, which is exactly what production must not carry forward.

create extension if not exists pgcrypto;

-- One-time removal of the hackathon tables, guarded by column type so re-runs
-- never touch the production tables that reuse these names (legacy ids were
-- text; production ids are uuid).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'events'
               and column_name = 'id' and data_type = 'text') then
    drop table public.events cascade;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'team_profiles'
               and column_name = 'id' and data_type = 'text') then
    drop table public.team_profiles cascade;
  end if;
end $$;

-- ---------------------------------------------------------------- companies

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- v1: one company per user. Makes "which org is this request for" unambiguous
-- everywhere; relax deliberately if multi-org membership ever becomes a feature.
create unique index if not exists org_members_one_org_per_user
  on public.org_members (user_id);

-- ----------------------------------------------------------------- profiles

create table if not exists public.team_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  archetype text not null,
  summary text not null,
  traits jsonb not null default '[]'::jsonb,
  directive text not null,
  source_repo text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists team_profiles_one_active_per_org
  on public.team_profiles (org_id)
  where is_active;

-- ------------------------------------------------------------------- events

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  team text not null default '',
  "user" text,
  request text not null,
  decision text not null check (decision in ('route_existing', 'spawn_new', 'handle_direct')),
  sub_agent text not null,
  reasoning text not null,
  terminal_line text not null,
  at timestamptz not null default now()
);

create index if not exists events_org_at on public.events (org_id, at desc);

-- -------------------------------------------------------------------- tasks

-- A task is real work for a real agent session. HQ creates one whenever a
-- decision routes to an agent; a runner claims it and executes it with a live
-- Claude Code session.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  request text not null,
  team text not null default '',
  requested_by text,
  sub_agent text not null,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'running', 'done', 'failed')),
  runner_id uuid,
  result_summary text,
  activity_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_org_status on public.tasks (org_id, status, created_at);

-- ------------------------------------------------------------------ runners

-- Only a hash of the runner token is stored; the token itself is shown once at
-- creation and never again.
create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  workspace text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- lockdown

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.team_profiles enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.runners enable row level security;
