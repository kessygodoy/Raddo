-- Mutual friendship connections share the existing private chat system.

alter table public.matches
  add column if not exists connection_type text not null default 'romantic';

alter table public.matches
  drop constraint if exists matches_connection_type_check;

alter table public.matches
  add constraint matches_connection_type_check
  check (connection_type in ('romantic', 'friendship'));

create table if not exists public.friend_requests (
  from_uid uuid not null references auth.users(id) on delete cascade,
  to_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_uid, to_uid),
  check (from_uid <> to_uid)
);

alter table public.friend_requests enable row level security;

drop policy if exists "users read own friend requests" on public.friend_requests;
create policy "users read own friend requests"
on public.friend_requests for select
to authenticated
using (from_uid = auth.uid());

drop policy if exists "users create own friend requests" on public.friend_requests;
create policy "users create own friend requests"
on public.friend_requests for insert
to authenticated
with check (from_uid = auth.uid());

drop policy if exists "users delete own friend requests" on public.friend_requests;
create policy "users delete own friend requests"
on public.friend_requests for delete
to authenticated
using (from_uid = auth.uid());

grant select, insert, delete on public.friend_requests to authenticated;

create index if not exists friend_requests_to_uid_idx
on public.friend_requests (to_uid, from_uid);

create or replace function public.connect_friend_profile(target_uid uuid)
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
  if viewer_uid is null then raise exception 'not authenticated'; end if;
  if target_uid is null or target_uid = viewer_uid then raise exception 'invalid target'; end if;
  if not exists (select 1 from public.profiles where id = target_uid) then
    raise exception 'target profile not found';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_uid = viewer_uid and blocked_uid = target_uid)
       or (blocker_uid = target_uid and blocked_uid = viewer_uid)
  ) then
    raise exception 'profile not available';
  end if;

  delete from public.likes where from_uid = viewer_uid and to_uid = target_uid;
  delete from public.passes where from_uid = viewer_uid and to_uid = target_uid;

  insert into public.friend_requests (from_uid, to_uid, created_at)
  values (viewer_uid, target_uid, now())
  on conflict (from_uid, to_uid) do update set created_at = excluded.created_at;

  select exists (
    select 1 from public.friend_requests
    where from_uid = target_uid and to_uid = viewer_uid
  ) into has_reciprocal;

  if has_reciprocal then
    match_users := array[least(viewer_uid, target_uid), greatest(viewer_uid, target_uid)];
    match_id := match_users[1]::text || '_' || match_users[2]::text;

    insert into public.matches (id, users, connection_type, created_at, last_message, last_message_at)
    values (match_id, match_users, 'friendship', now(), '', null)
    on conflict (id) do update
      set connection_type = case
        when public.matches.connection_type = 'romantic' then 'romantic'
        else 'friendship'
      end;
  end if;

  return has_reciprocal;
end;
$$;

grant execute on function public.connect_friend_profile(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;
