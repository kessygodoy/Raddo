-- Let recipients review friendship requests and explicitly decline them.

drop policy if exists "users read own friend requests" on public.friend_requests;
create policy "users read own friend requests"
on public.friend_requests for select
to authenticated
using (from_uid = auth.uid() or to_uid = auth.uid());

create or replace function public.decline_friend_request(requester_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
begin
  if viewer_uid is null then raise exception 'not authenticated'; end if;
  if requester_uid is null or requester_uid = viewer_uid then raise exception 'invalid requester'; end if;

  delete from public.friend_requests
  where from_uid = requester_uid
    and to_uid = viewer_uid;
end;
$$;

revoke all on function public.decline_friend_request(uuid) from public;
grant execute on function public.decline_friend_request(uuid) to authenticated;
