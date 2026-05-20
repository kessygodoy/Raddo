-- Run this in Supabase SQL Editor to fix:
-- 1. Matches not appearing in chat
-- 2. Could not find the table 'public.map_events' in the schema cache

create extension if not exists "pgcrypto";

create table if not exists public.likes (
  from_uid uuid not null references auth.users(id) on delete cascade,
  to_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_uid, to_uid),
  check (from_uid <> to_uid)
);

create table if not exists public.passes (
  from_uid uuid not null,
  to_uid uuid not null,
  created_at timestamptz not null default now(),
  primary key (from_uid, to_uid),
  check (from_uid <> to_uid)
);

create table if not exists public.blocks (
  blocker_uid uuid not null references auth.users(id) on delete cascade,
  blocked_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_uid, blocked_uid),
  check (blocker_uid <> blocked_uid)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid uuid not null references auth.users(id) on delete cascade,
  reported_uid uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'reported_profile',
  created_at timestamptz not null default now(),
  check (reporter_uid <> reported_uid)
);

create table if not exists public.matches (
  id text primary key,
  users uuid[] not null,
  created_at timestamptz not null default now(),
  last_message text not null default '',
  last_message_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  sender_uid uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

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

alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.map_events enable row level security;
alter table public.map_event_messages enable row level security;
alter table public.map_event_participants enable row level security;

drop policy if exists "users read own likes" on public.likes;
drop policy if exists "users create own likes" on public.likes;
drop policy if exists "users read own passes" on public.passes;
drop policy if exists "users create own passes" on public.passes;
drop policy if exists "users delete own passes" on public.passes;
drop policy if exists "users read own blocks" on public.blocks;
drop policy if exists "users create own blocks" on public.blocks;
drop policy if exists "users delete own blocks" on public.blocks;
drop policy if exists "users create reports" on public.reports;
drop policy if exists "users read own reports" on public.reports;
drop policy if exists "match members read matches" on public.matches;
drop policy if exists "match members create matches" on public.matches;
drop policy if exists "match members update matches" on public.matches;
drop policy if exists "match members delete matches" on public.matches;
drop policy if exists "match members read messages" on public.messages;
drop policy if exists "match members send messages" on public.messages;
drop policy if exists "authenticated users read map events" on public.map_events;
drop policy if exists "authenticated users create map events" on public.map_events;
drop policy if exists "creators delete own map events" on public.map_events;
drop policy if exists "event messages are readable" on public.map_event_messages;
drop policy if exists "authenticated users send event messages" on public.map_event_messages;
drop policy if exists "event participants are readable" on public.map_event_participants;
drop policy if exists "authenticated users join map events" on public.map_event_participants;
drop policy if exists "authenticated users leave map events" on public.map_event_participants;

create policy "users read own likes"
on public.likes for select
to authenticated
using (auth.uid() = from_uid or auth.uid() = to_uid);

create policy "users create own likes"
on public.likes for insert
to authenticated
with check (auth.uid() = from_uid);

create policy "users read own passes"
on public.passes for select
to authenticated
using (auth.uid() = from_uid);

create policy "users create own passes"
on public.passes for insert
to authenticated
with check (auth.uid() = from_uid);

create policy "users delete own passes"
on public.passes for delete
to authenticated
using (auth.uid() = from_uid);

create policy "users read own blocks"
on public.blocks for select
to authenticated
using (auth.uid() = blocker_uid or auth.uid() = blocked_uid);

create policy "users create own blocks"
on public.blocks for insert
to authenticated
with check (auth.uid() = blocker_uid);

create policy "users delete own blocks"
on public.blocks for delete
to authenticated
using (auth.uid() = blocker_uid);

create policy "users create reports"
on public.reports for insert
to authenticated
with check (auth.uid() = reporter_uid);

create policy "users read own reports"
on public.reports for select
to authenticated
using (auth.uid() = reporter_uid);

create policy "match members read matches"
on public.matches for select
to authenticated
using (auth.uid() = any(users));

create policy "match members create matches"
on public.matches for insert
to authenticated
with check (auth.uid() = any(users));

create policy "match members update matches"
on public.matches for update
to authenticated
using (auth.uid() = any(users))
with check (auth.uid() = any(users));

create policy "match members delete matches"
on public.matches for delete
to authenticated
using (auth.uid() = any(users));

create policy "match members read messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.matches
    where matches.id = messages.match_id
    and auth.uid() = any(matches.users)
  )
);

create policy "match members send messages"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_uid
  and exists (
    select 1 from public.matches
    where matches.id = messages.match_id
    and auth.uid() = any(matches.users)
  )
);

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

create or replace function public.like_profile(target_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
  match_users uuid[];
  match_id text;
  has_reciprocal boolean;
begin
  if viewer_uid is null then
    raise exception 'not authenticated';
  end if;

  if target_uid is null or target_uid = viewer_uid then
    raise exception 'invalid target';
  end if;

  insert into public.likes (from_uid, to_uid, created_at)
  values (viewer_uid, target_uid, now())
  on conflict (from_uid, to_uid) do update
    set created_at = excluded.created_at;

  select exists (
    select 1
    from public.likes
    where from_uid = target_uid
    and to_uid = viewer_uid
  ) into has_reciprocal;

  if has_reciprocal then
    match_users := array[least(viewer_uid, target_uid), greatest(viewer_uid, target_uid)];
    match_id := match_users[1]::text || '_' || match_users[2]::text;

    insert into public.matches (id, users, created_at, last_message, last_message_at)
    values (match_id, match_users, now(), 'Match criado', now())
    on conflict (id) do update
      set last_message = coalesce(nullif(public.matches.last_message, ''), excluded.last_message),
          last_message_at = coalesce(public.matches.last_message_at, excluded.last_message_at);
  end if;

  return has_reciprocal;
end;
$$;

grant execute on function public.like_profile(uuid) to authenticated;
grant select, insert on public.likes to authenticated;
grant select, insert, delete on public.passes to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.map_events to authenticated;
grant select, insert on public.map_event_messages to authenticated;
grant select, insert, delete on public.map_event_participants to authenticated;

notify pgrst, 'reload schema';
