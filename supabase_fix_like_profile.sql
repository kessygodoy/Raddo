-- Run this in Supabase SQL Editor if the app says:
-- could not find the function public.like_profile(target_uid) in the schema cache

drop function if exists public.like_profile(uuid);

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
    on conflict (id) do nothing;
  end if;

  return has_reciprocal;
end;
$$;

grant execute on function public.like_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
