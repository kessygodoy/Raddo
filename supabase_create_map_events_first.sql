-- Run this whole file in Supabase SQL Editor first.
-- It creates the map chat tables before any policy tries to use them.

create extension if not exists "pgcrypto";

create table if not exists public.map_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 80),
  description text not null default '',
  cover_url text not null default '',
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 5 check (radius_km between 0.1 and 50),
  creator_uid uuid not null,
  created_at timestamptz not null default now()
);

alter table public.map_events add column if not exists cover_url text not null default '';

create table if not exists public.map_event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.map_events(id) on delete cascade,
  sender_uid uuid not null,
  sender_name text not null default 'Pessoa',
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.map_event_participants (
  event_id uuid not null references public.map_events(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_uid)
);

alter table public.map_events enable row level security;
alter table public.map_event_messages enable row level security;
alter table public.map_event_participants enable row level security;

drop policy if exists "authenticated users read map events" on public.map_events;
drop policy if exists "authenticated users create map events" on public.map_events;
drop policy if exists "creators delete own map events" on public.map_events;
drop policy if exists "event messages are readable" on public.map_event_messages;
drop policy if exists "authenticated users send event messages" on public.map_event_messages;
drop policy if exists "event participants are readable" on public.map_event_participants;
drop policy if exists "authenticated users join map events" on public.map_event_participants;
drop policy if exists "authenticated users leave map events" on public.map_event_participants;

create policy "authenticated users read map events"
on public.map_events for select
to authenticated
using (true);

create policy "authenticated users create map events"
on public.map_events for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "creators delete own map events"
on public.map_events for delete
to authenticated
using (auth.uid() = creator_uid);

create policy "event messages are readable"
on public.map_event_messages for select
to authenticated
using (true);

create policy "authenticated users send event messages"
on public.map_event_messages for insert
to authenticated
with check (auth.uid() = sender_uid);

create policy "event participants are readable"
on public.map_event_participants for select
to authenticated
using (true);

create policy "authenticated users join map events"
on public.map_event_participants for insert
to authenticated
with check (auth.uid() = user_uid);

create policy "authenticated users leave map events"
on public.map_event_participants for delete
to authenticated
using (auth.uid() = user_uid);

grant select, insert, delete on public.map_events to authenticated;
grant select, insert on public.map_event_messages to authenticated;
grant select, insert, delete on public.map_event_participants to authenticated;

notify pgrst, 'reload schema';
