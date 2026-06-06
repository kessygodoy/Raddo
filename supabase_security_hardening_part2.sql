-- Seguranca Raddo - parte 2/2.
-- Rode depois da parte 1.

drop policy if exists "event join requests are readable" on public.map_event_join_requests;
drop policy if exists "event join requests readable by requester or managers" on public.map_event_join_requests;
create policy "event join requests readable by requester or managers"
on public.map_event_join_requests for select
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
drop policy if exists "users create own join requests" on public.map_event_join_requests;
create policy "users create own join requests"
on public.map_event_join_requests for insert
to authenticated
with check (
  user_uid = auth.uid()
  and not exists (
    select 1 from public.map_event_bans
    where map_event_bans.event_id = map_event_join_requests.event_id
      and map_event_bans.user_uid = auth.uid()
  )
);

drop policy if exists "authenticated users manage event join requests" on public.map_event_join_requests;
drop policy if exists "event owners and moderators manage event join requests" on public.map_event_join_requests;
drop policy if exists "join requests deleted by requester or managers" on public.map_event_join_requests;
create policy "join requests deleted by requester or managers"
on public.map_event_join_requests for delete
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users leave map events" on public.map_event_participants;
drop policy if exists "event owners and moderators remove participants" on public.map_event_participants;
drop policy if exists "participants leave own map events" on public.map_event_participants;
create policy "participants leave own map events"
on public.map_event_participants for delete
to authenticated
using (user_uid = auth.uid());

drop policy if exists "event owners and moderators remove participants" on public.map_event_participants;
create policy "event owners and moderators remove participants"
on public.map_event_participants for delete
to authenticated
using (
  user_uid <> auth.uid()
  and public.user_can_manage_map_event(event_id)
);

drop policy if exists "users delete own profile photos" on storage.objects;
create policy "users delete own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

delete from public.profile_crossings
where last_crossed_at < now() - interval '30 days';

alter table public.profile_crossings
drop constraint if exists profile_crossings_distance_check;

alter table public.profile_crossings
add constraint profile_crossings_distance_check
check (distance_meters between 0 and 250);

drop policy if exists "profile_crossings_insert_own" on public.profile_crossings;
create policy "profile_crossings_insert_own"
on public.profile_crossings
for insert
with check (
  auth.uid() = user_uid
  and distance_meters between 0 and 250
);

drop policy if exists "profile_crossings_update_own" on public.profile_crossings;
create policy "profile_crossings_update_own"
on public.profile_crossings
for update
using (auth.uid() = user_uid)
with check (
  auth.uid() = user_uid
  and distance_meters between 0 and 250
);

notify pgrst, 'reload schema';
