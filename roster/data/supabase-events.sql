-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- (or via DATABASE_URL with: npm run db:migrate)

create table if not exists public.events (
  id text primary key,
  team text not null,
  "user" text,
  request text not null,
  decision text not null check (decision in ('route_existing', 'spawn_new', 'handle_direct')),
  sub_agent text not null,
  reasoning text not null,
  terminal_line text not null,
  timestamp timestamptz not null default now()
);

alter table public.events enable row level security;

-- Hackathon-open policies so the publishable/anon key can read+write events.
drop policy if exists "roster_events_select" on public.events;
drop policy if exists "roster_events_insert" on public.events;
drop policy if exists "roster_events_delete" on public.events;

create policy "roster_events_select" on public.events
  for select to anon, authenticated using (true);

create policy "roster_events_insert" on public.events
  for insert to anon, authenticated with check (true);

create policy "roster_events_delete" on public.events
  for delete to anon, authenticated using (true);
