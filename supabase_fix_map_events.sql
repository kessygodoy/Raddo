-- Run this in Supabase SQL Editor if the app says:
-- Could not find the table 'public.map_events' in the schema cache

create extension if not exists "pgcrypto";

create table if not exists public.map_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 80),
  description text not null default '',
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 5 check (radius_km between 0.1 and 50),
  creator_uid uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.map_event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.map_events(id) on delete cascade,
  sender_uid uuid not null,
  sender_name text not null default 'Pessoa',
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.map_events enable row level security;
alter table public.map_event_messages enable row level security;

drop policy if exists "authenticated users read map events" on public.map_events;
drop policy if exists "authenticated users create map events" on public.map_events;
drop policy if exists "event messages are readable" on public.map_event_messages;
drop policy if exists "authenticated users send event messages" on public.map_event_messages;

create policy "authenticated users read map events"
on public.map_events for select
to authenticated
using (true);

create policy "authenticated users create map events"
on public.map_events for insert
to authenticated
with check (auth.uid() = creator_uid);

create policy "event messages are readable"
on public.map_event_messages for select
to authenticated
using (
  exists (
    select 1 from public.map_events
    where map_events.id = map_event_messages.event_id
  )
);

create policy "authenticated users send event messages"
on public.map_event_messages for insert
to authenticated
with check (auth.uid() = sender_uid);

grant select, insert on public.map_events to authenticated;
grant select, insert on public.map_event_messages to authenticated;

notify pgrst, 'reload schema';
