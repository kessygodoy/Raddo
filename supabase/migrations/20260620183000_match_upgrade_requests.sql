-- Friendship members can mutually agree to turn their connection into a romantic match.

create table if not exists public.match_upgrade_requests (
  match_id text primary key references public.matches(id) on delete cascade,
  requester_uid uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint match_upgrade_requests_status_check check (status in ('pending', 'accepted', 'declined'))
);

alter table public.match_upgrade_requests enable row level security;

drop policy if exists "match members read upgrade requests" on public.match_upgrade_requests;
create policy "match members read upgrade requests"
on public.match_upgrade_requests for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = match_upgrade_requests.match_id
      and auth.uid() = any(matches.users)
  )
);

grant select on public.match_upgrade_requests to authenticated;

create or replace function public.request_match_upgrade(target_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
  current_users uuid[];
  current_type text;
begin
  if viewer_uid is null then raise exception 'not authenticated'; end if;

  select users, connection_type
  into current_users, current_type
  from public.matches
  where id = target_match_id
  for update;

  if current_users is null or not (viewer_uid = any(current_users)) then
    raise exception 'match not found or not allowed';
  end if;
  if current_type <> 'friendship' then
    raise exception 'connection is already a romantic match';
  end if;
  if exists (
    select 1 from public.match_upgrade_requests
    where match_id = target_match_id and status = 'pending'
  ) then
    raise exception 'an upgrade request is already pending';
  end if;

  insert into public.match_upgrade_requests (match_id, requester_uid, status, created_at, responded_at)
  values (target_match_id, viewer_uid, 'pending', now(), null)
  on conflict (match_id) do update
    set requester_uid = excluded.requester_uid,
        status = 'pending',
        created_at = excluded.created_at,
        responded_at = null;
end;
$$;

create or replace function public.respond_match_upgrade(target_match_id text, accept_request boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
  current_users uuid[];
  current_type text;
  request_owner uuid;
begin
  if viewer_uid is null then raise exception 'not authenticated'; end if;

  select users, connection_type
  into current_users, current_type
  from public.matches
  where id = target_match_id
  for update;

  if current_users is null or not (viewer_uid = any(current_users)) then
    raise exception 'match not found or not allowed';
  end if;
  if current_type <> 'friendship' then
    raise exception 'connection is already a romantic match';
  end if;

  select requester_uid
  into request_owner
  from public.match_upgrade_requests
  where match_id = target_match_id and status = 'pending'
  for update;

  if request_owner is null then raise exception 'pending request not found'; end if;
  if request_owner = viewer_uid then raise exception 'requester cannot respond to own request'; end if;

  update public.match_upgrade_requests
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where match_id = target_match_id;

  if accept_request then
    update public.matches
    set connection_type = 'romantic'
    where id = target_match_id;
  end if;

  return accept_request;
end;
$$;

revoke all on function public.request_match_upgrade(text) from public;
revoke all on function public.respond_match_upgrade(text, boolean) from public;
grant execute on function public.request_match_upgrade(text) to authenticated;
grant execute on function public.respond_match_upgrade(text, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_upgrade_requests'
  ) then
    alter publication supabase_realtime add table public.match_upgrade_requests;
  end if;
end;
$$;
