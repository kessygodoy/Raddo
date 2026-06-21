-- Expose only the aggregate number of a profile's matches and friendships.

create or replace function public.profile_connection_count(target_uid uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.matches
  where target_uid = any(users);
$$;

revoke all on function public.profile_connection_count(uuid) from public;
grant execute on function public.profile_connection_count(uuid) to authenticated;
