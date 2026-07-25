-- Durable Team Profile storage.
--
-- Person D's handover flagged this: the active profile is written to
-- data/active-profile.json, which does not survive a serverless deploy and is
-- not shared between concurrent sessions. That breaks the actual demo shape —
-- a manager onboards, then employees join and must land already calibrated.
-- Local JSON gives each of them a different (or empty) profile.
--
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run
-- (or via DATABASE_URL with: npm run db:migrate)

create table if not exists public.team_profiles (
  id text primary key,
  team text not null default 'default',
  archetype text not null,
  summary text not null,
  -- jsonb rather than text[]: traits are prose strings that routinely contain
  -- commas and quoted commit messages, which array literals mangle.
  traits jsonb not null default '[]'::jsonb,
  directive text not null,
  source_repo text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- One active profile per team. Onboarding deactivates the previous one rather
-- than deleting it, so re-running onboarding is non-destructive and the history
-- of what a team was calibrated on stays queryable.
create unique index if not exists team_profiles_one_active_per_team
  on public.team_profiles (team)
  where is_active;

create index if not exists team_profiles_updated_at_idx
  on public.team_profiles (updated_at desc);

alter table public.team_profiles enable row level security;

-- Hackathon-open policies, matching data/supabase-events.sql so the
-- publishable/anon key can read and write.
drop policy if exists "roster_team_profiles_select" on public.team_profiles;
drop policy if exists "roster_team_profiles_insert" on public.team_profiles;
drop policy if exists "roster_team_profiles_update" on public.team_profiles;
drop policy if exists "roster_team_profiles_delete" on public.team_profiles;

create policy "roster_team_profiles_select" on public.team_profiles
  for select to anon, authenticated using (true);

create policy "roster_team_profiles_insert" on public.team_profiles
  for insert to anon, authenticated with check (true);

create policy "roster_team_profiles_update" on public.team_profiles
  for update to anon, authenticated using (true) with check (true);

create policy "roster_team_profiles_delete" on public.team_profiles
  for delete to anon, authenticated using (true);
