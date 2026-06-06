create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  viewer_uid uuid := auth.uid();
begin
  if viewer_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.map_event_messages
  where sender_uid = viewer_uid
     or event_id in (
       select id from public.map_events where creator_uid = viewer_uid
     );

  delete from public.map_event_participants
  where user_uid = viewer_uid
     or event_id in (
       select id from public.map_events where creator_uid = viewer_uid
     );

  delete from public.map_events
  where creator_uid = viewer_uid;

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
