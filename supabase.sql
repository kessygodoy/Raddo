create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Novo radar',
  photo_url text not null default '',
  photos text[] not null default '{}',
  lat double precision,
  lng double precision,
  privacy_mode text not null default 'nearby' check (privacy_mode in ('exact', 'city', 'nearby')),
  appear_in_cards boolean not null default true,
  show_distance boolean not null default true,
  show_online_status boolean not null default true,
  visibility_radius double precision not null default 5 check (visibility_radius between 0.02 and 500),
  age integer not null default 18,
  gender text not null default 'man' check (gender in ('man', 'woman', 'couple')),
  gender_identities text[] not null default '{}',
  sexualities text[] not null default '{}',
  looking_for text[] not null default array['man', 'woman', 'couple'],
  interested_sexualities text[] not null default '{}',
  interests text[] not null default '{}',
  relationship_goals text[] not null default '{}',
  min_age_preference integer not null default 18,
  max_age_preference integer not null default 60,
  last_seen timestamptz,
  bio text not null default '',
  is_premium boolean not null default false,
  likes_used_today integer not null default 0,
  likes_quota_date date,
  likes_bonus integer not null default 0,
  liked_by_unlock_until timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists sexualities text[] not null default '{}';
alter table public.profiles add column if not exists age integer not null default 18;
alter table public.profiles add column if not exists appear_in_cards boolean not null default true;
alter table public.profiles add column if not exists show_distance boolean not null default true;
alter table public.profiles add column if not exists show_online_status boolean not null default true;
alter table public.profiles add column if not exists interested_sexualities text[] not null default '{}';
alter table public.profiles add column if not exists gender_identities text[] not null default '{}';
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists relationship_goals text[] not null default '{}';
alter table public.profiles add column if not exists min_age_preference integer not null default 18;
alter table public.profiles add column if not exists max_age_preference integer not null default 60;
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists likes_used_today integer not null default 0;
alter table public.profiles add column if not exists likes_quota_date date;
alter table public.profiles add column if not exists likes_bonus integer not null default 0;
alter table public.profiles add column if not exists liked_by_unlock_until timestamptz;
alter table public.profiles alter column visibility_radius type double precision;
update public.profiles set gender = 'man' where gender not in ('man', 'woman', 'couple');
update public.profiles
set looking_for = array['man', 'woman', 'couple']
where looking_for is null or looking_for && array['women', 'men', 'nonbinary'];
update public.profiles
set gender_identities = array[gender]
where gender_identities = '{}';
alter table public.profiles drop constraint if exists profiles_visibility_radius_check;
alter table public.profiles add constraint profiles_visibility_radius_check check (visibility_radius between 0.02 and 500);
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('man', 'woman', 'couple'));
alter table public.profiles drop constraint if exists profiles_age_check;
alter table public.profiles add constraint profiles_age_check check (age between 18 and 99);
alter table public.profiles drop constraint if exists profiles_age_preference_check;
alter table public.profiles add constraint profiles_age_preference_check check (
  min_age_preference between 18 and 99
  and max_age_preference between 18 and 99
  and min_age_preference <= max_age_preference
);

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
  context_type text not null default 'profile',
  context_id text not null default '',
  context_title text not null default '',
  reason text not null default 'reported_profile',
  recent_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (reporter_uid <> reported_uid)
);

create table if not exists public.image_moderation_reports (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  owner_display_name text not null default '',
  bucket text not null,
  storage_path text not null,
  public_url text not null,
  context text not null default 'image',
  reasons text[] not null default '{}',
  recent_messages jsonb not null default '[]'::jsonb,
  safe_search jsonb not null default '{}'::jsonb,
  status text not null default 'pending_human_review',
  created_at timestamptz not null default now()
);

create table if not exists public.app_moderators (
  user_uid uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_bans (
  banned_uid uuid primary key references auth.users(id) on delete cascade,
  banned_by_uid uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'violacao_das_regras',
  created_at timestamptz not null default now(),
  check (banned_uid <> banned_by_uid)
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
  message_type text not null default 'text',
  image_url text not null default '',
  image_path text not null default '',
  view_once boolean not null default false,
  viewed_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.map_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 80),
  description text not null default '',
  cover_url text not null default '',
  emoji text not null default '💬',
  access_mode text not null default 'open' check (access_mode in ('open', 'approval', 'password')),
  password_hash text not null default '',
  is_permanent boolean not null default false,
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 5 check (radius_km between 0.1 and 50),
  creator_uid uuid not null,
  created_at timestamptz not null default now()
);

alter table public.map_events add column if not exists cover_url text not null default '';
alter table public.map_events add column if not exists emoji text not null default '💬';

alter table public.map_events add column if not exists access_mode text not null default 'open';
alter table public.map_events add column if not exists password_hash text not null default '';
alter table public.map_events add column if not exists is_permanent boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'map_events_access_mode_check'
  ) then
    alter table public.map_events
      add constraint map_events_access_mode_check check (access_mode in ('open', 'approval', 'password'));
  end if;
end $$;

create table if not exists public.map_event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.map_events(id) on delete cascade,
  sender_uid uuid not null,
  sender_name text not null default 'Pessoa',
  text text not null check (length(text) between 1 and 1000),
  message_type text not null default 'text',
  image_url text not null default '',
  image_path text not null default '',
  view_once boolean not null default false,
  viewed_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.map_event_participants (
  event_id uuid not null references public.map_events(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_uid)
);

create table if not exists public.map_event_moderators (
  event_id uuid not null references public.map_events(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_uid)
);

create table if not exists public.map_event_join_requests (
  event_id uuid not null references public.map_events(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_uid)
);

create table if not exists public.map_event_bans (
  event_id uuid not null references public.map_events(id) on delete cascade,
  user_uid uuid not null references auth.users(id) on delete cascade,
  banned_by_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_uid)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'likes_from_uid_fkey'
  ) then
    alter table public.likes
      add constraint likes_from_uid_fkey foreign key (from_uid) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'likes_to_uid_fkey'
  ) then
    alter table public.likes
      add constraint likes_to_uid_fkey foreign key (to_uid) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'messages_sender_uid_fkey'
  ) then
    alter table public.messages
      add constraint messages_sender_uid_fkey foreign key (sender_uid) references auth.users(id) on delete cascade;
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.image_moderation_reports enable row level security;
alter table public.app_moderators enable row level security;
alter table public.app_bans enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.map_events enable row level security;
alter table public.map_event_messages enable row level security;
alter table public.map_event_participants enable row level security;
alter table public.map_event_moderators enable row level security;
alter table public.map_event_join_requests enable row level security;
alter table public.map_event_bans enable row level security;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profile photos are public" on storage.objects;
drop policy if exists "users upload own profile photos" on storage.objects;
drop policy if exists "users update own profile photos" on storage.objects;
drop policy if exists "users read own likes" on public.likes;
drop policy if exists "users create own likes" on public.likes;
drop policy if exists "users delete own likes" on public.likes;
drop policy if exists "users read own passes" on public.passes;
drop policy if exists "users create own passes" on public.passes;
drop policy if exists "users delete own passes" on public.passes;
drop policy if exists "users read own blocks" on public.blocks;
drop policy if exists "users create own blocks" on public.blocks;
drop policy if exists "users delete own blocks" on public.blocks;
drop policy if exists "users create reports" on public.reports;
drop policy if exists "users read own reports" on public.reports;
drop policy if exists "users read own image moderation reports" on public.image_moderation_reports;
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
drop policy if exists "event moderators are readable" on public.map_event_moderators;
drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
drop policy if exists "event join requests are readable" on public.map_event_join_requests;
drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
drop policy if exists "authenticated users manage event join requests" on public.map_event_join_requests;
drop policy if exists "event bans are readable" on public.map_event_bans;
drop policy if exists "authenticated users manage event bans" on public.map_event_bans;

create policy "profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profile photos are public"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-photos');

create policy "users upload own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users update own profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users read own likes"
on public.likes for select
to authenticated
using (auth.uid() = from_uid or auth.uid() = to_uid);

create policy "users create own likes"
on public.likes for insert
to authenticated
with check (auth.uid() = from_uid);

create policy "users delete own likes"
on public.likes for delete
to authenticated
using (auth.uid() = from_uid);

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

create policy "moderators read reports"
on public.reports for select
to authenticated
using (public.is_app_moderator());

create policy "users read own image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (auth.uid() = owner_uid);

create policy "moderators read image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (public.is_app_moderator());

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

grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.passes to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select on public.image_moderation_reports to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update on public.messages to authenticated;

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

drop policy if exists "match members update message views" on public.messages;
create policy "match members update message views"
on public.messages for update
to authenticated
using (
  exists (
    select 1 from public.matches
    where matches.id = messages.match_id
    and auth.uid() = any(matches.users)
  )
)
with check (
  exists (
    select 1 from public.matches
    where matches.id = messages.match_id
    and auth.uid() = any(matches.users)
  )
);

drop policy if exists "authenticated users read map events" on public.map_events;
create policy "authenticated users read map events"
on public.map_events for select
to authenticated
using (true);

drop policy if exists "authenticated users create map events" on public.map_events;
create policy "authenticated users create map events"
on public.map_events for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "creators delete own map events" on public.map_events;
create policy "creators delete own map events"
on public.map_events for delete
to authenticated
using (auth.uid() = creator_uid);

drop policy if exists "event messages are readable" on public.map_event_messages;
create policy "event messages are readable"
on public.map_event_messages for select
to authenticated
using (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
      and map_event_messages.created_at >= map_event_participants.joined_at
  )
);

drop policy if exists "authenticated users send event messages" on public.map_event_messages;
create policy "authenticated users send event messages"
on public.map_event_messages for insert
to authenticated
with check (
  auth.uid() = sender_uid
  and exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
      and map_event_messages.created_at >= map_event_participants.joined_at
  )
);

drop policy if exists "event participants update message views" on public.map_event_messages;
create policy "event participants update message views"
on public.map_event_messages for update
to authenticated
using (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
);

drop policy if exists "event participants are readable" on public.map_event_participants;
create policy "event participants are readable"
on public.map_event_participants for select
to authenticated
using (true);

drop policy if exists "authenticated users join map events" on public.map_event_participants;
create policy "authenticated users join map events"
on public.map_event_participants for insert
to authenticated
with check (auth.uid() = user_uid);

drop policy if exists "authenticated users leave map events" on public.map_event_participants;
create policy "authenticated users leave map events"
on public.map_event_participants for delete
to authenticated
using (auth.uid() = user_uid);

grant select, insert, delete on public.map_events to authenticated;
grant select, insert, update on public.map_event_messages to authenticated;
grant select, insert, delete on public.map_event_participants to authenticated;
grant select, insert, delete on public.map_event_moderators to authenticated;
grant select, insert, delete on public.map_event_join_requests to authenticated;
grant select, insert, delete on public.map_event_bans to authenticated;

drop policy if exists "event moderators are readable" on public.map_event_moderators;
create policy "event moderators are readable"
on public.map_event_moderators for select
to authenticated
using (true);

drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
create policy "authenticated users manage event moderators"
on public.map_event_moderators for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "event join requests are readable" on public.map_event_join_requests;
create policy "event join requests are readable"
on public.map_event_join_requests for select
to authenticated
using (true);

drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
create policy "authenticated users create event join requests"
on public.map_event_join_requests for insert
to authenticated
with check (auth.uid() = user_uid);

drop policy if exists "authenticated users manage event join requests" on public.map_event_join_requests;
create policy "authenticated users manage event join requests"
on public.map_event_join_requests for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "event bans are readable" on public.map_event_bans;
create policy "event bans are readable"
on public.map_event_bans for select
to authenticated
using (true);

drop policy if exists "authenticated users manage event bans" on public.map_event_bans;
create policy "authenticated users manage event bans"
on public.map_event_bans for all
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

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

  if not exists (select 1 from public.profiles where id = target_uid) then
    raise exception 'target profile not found';
  end if;

  if not exists (select 1 from public.profiles where id = viewer_uid) then
    raise exception 'viewer profile not found';
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
      set last_message = public.matches.last_message,
          last_message_at = public.matches.last_message_at;
  end if;

  return has_reciprocal;
end;
$$;

grant execute on function public.like_profile(uuid) to authenticated;

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
  viewer_email text;
  created_profile public.profiles;
begin
  if viewer_uid is null then
    raise exception 'not authenticated';
  end if;

  select email into viewer_email
  from auth.users
  where id = viewer_uid;

  insert into public.profiles (
    id,
    display_name,
    photo_url,
    photos,
    privacy_mode,
    appear_in_cards,
    show_distance,
    show_online_status,
    visibility_radius,
    age,
    gender,
    gender_identities,
    sexualities,
    looking_for,
    interested_sexualities,
    interests,
    relationship_goals,
    min_age_preference,
    max_age_preference,
    bio,
    is_premium,
    likes_used_today,
    likes_quota_date,
    likes_bonus,
    liked_by_unlock_until,
    last_seen
  )
  values (
    viewer_uid,
    coalesce(split_part(viewer_email, '@', 1), 'Novo radar'),
    '',
    '{}',
    'nearby',
    true,
    true,
    true,
    5,
    18,
    'man',
    array['man'],
    '{}',
    array['man', 'woman', 'couple'],
    '{}',
    '{}',
    '{}',
    18,
    60,
    '',
    false,
    0,
    current_date,
    0,
    null,
    now()
  )
  on conflict (id) do update
    set last_seen = excluded.last_seen
  returning * into created_profile;

  return created_profile;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  viewer_uid uuid := auth.uid();
  owner_event_filter text := ' or event_id in (select id from public.map_events where creator_uid = $1)';
begin
  if viewer_uid is null then
    raise exception 'not authenticated';
  end if;

  if to_regclass('public.device_push_tokens') is not null then
    execute 'delete from public.device_push_tokens where user_uid = $1' using viewer_uid;
  end if;
  if to_regclass('public.push_delivery_logs') is not null then
    execute 'delete from public.push_delivery_logs where sender_uid = $1' using viewer_uid;
  end if;
  if to_regclass('public.image_moderation_reports') is not null then
    execute 'delete from public.image_moderation_reports where owner_uid = $1' using viewer_uid;
  end if;
  if to_regclass('public.app_moderators') is not null then
    execute 'delete from public.app_moderators where user_uid = $1' using viewer_uid;
  end if;
  if to_regclass('public.app_bans') is not null then
    execute 'delete from public.app_bans where banned_uid = $1 or banned_by_uid = $1' using viewer_uid;
  end if;
  if to_regclass('public.map_event_bans') is not null then
    execute 'delete from public.map_event_bans where user_uid = $1 or banned_by_uid = $1' || owner_event_filter using viewer_uid;
  end if;
  if to_regclass('public.map_event_join_requests') is not null then
    execute 'delete from public.map_event_join_requests where user_uid = $1' || owner_event_filter using viewer_uid;
  end if;
  if to_regclass('public.map_event_moderators') is not null then
    execute 'delete from public.map_event_moderators where user_uid = $1' || owner_event_filter using viewer_uid;
  end if;
  if to_regclass('public.map_event_messages') is not null then
    execute 'delete from public.map_event_messages where sender_uid = $1' || owner_event_filter using viewer_uid;
  end if;
  if to_regclass('public.map_event_participants') is not null then
    execute 'delete from public.map_event_participants where user_uid = $1' || owner_event_filter using viewer_uid;
  end if;
  if to_regclass('public.map_events') is not null then
    execute 'delete from public.map_events where creator_uid = $1' using viewer_uid;
  end if;

  delete from public.messages
  where sender_uid = viewer_uid
     or match_id in (
       select id from public.matches where viewer_uid = any(users)
     );

  delete from public.matches
  where viewer_uid = any(users);

  delete from public.likes
  where from_uid = viewer_uid or to_uid = viewer_uid;

  delete from public.passes
  where from_uid = viewer_uid or to_uid = viewer_uid;

  delete from public.blocks
  where blocker_uid = viewer_uid or blocked_uid = viewer_uid;

  if to_regclass('public.profile_crossings') is not null then
    execute 'delete from public.profile_crossings where user_uid = $1 or crossed_uid = $1' using viewer_uid;
  end if;

  delete from public.reports
  where reporter_uid = viewer_uid or reported_uid = viewer_uid;

  delete from public.profiles
  where id = viewer_uid;

  delete from auth.users
  where id = viewer_uid;

  return true;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
