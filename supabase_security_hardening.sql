-- Reforcos de seguranca do Raddo.
-- Rode este arquivo no SQL Editor do Supabase depois dos outros scripts principais.

create or replace function public.user_can_manage_map_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.map_events
        where id = target_event_id
          and creator_uid = auth.uid()
      )
      or exists (
        select 1
        from public.map_event_moderators
        where event_id = target_event_id
          and user_uid = auth.uid()
      )
    );
$$;

grant execute on function public.user_can_manage_map_event(uuid) to authenticated;

drop policy if exists "authenticated users create map events" on public.map_events;
create policy "event creators create own map events"
on public.map_events for insert
to authenticated
with check (auth.uid() = creator_uid);

drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
drop policy if exists "authenticated users remove event moderators" on public.map_event_moderators;
drop policy if exists "event owners manage event moderators" on public.map_event_moderators;
create policy "event owners add moderators"
on public.map_event_moderators for insert
to authenticated
with check (
  exists (
    select 1 from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
      and map_event_moderators.user_uid <> auth.uid()
  )
);

create policy "event owners remove moderators"
on public.map_event_moderators for delete
to authenticated
using (
  exists (
    select 1 from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
  )
);

drop policy if exists "event bans are readable" on public.map_event_bans;
create policy "event bans readable by banned user or managers"
on public.map_event_bans for select
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users manage event bans" on public.map_event_bans;
drop policy if exists "authenticated users create event bans" on public.map_event_bans;
drop policy if exists "authenticated users remove event bans" on public.map_event_bans;
drop policy if exists "event owners and moderators manage event bans" on public.map_event_bans;
create policy "event owners and moderators create bans"
on public.map_event_bans for insert
to authenticated
with check (
  banned_by_uid = auth.uid()
  and user_uid <> auth.uid()
  and public.user_can_manage_map_event(event_id)
);

create policy "event owners and moderators remove bans"
on public.map_event_bans for delete
to authenticated
using (public.user_can_manage_map_event(event_id));

drop policy if exists "event join requests are readable" on public.map_event_join_requests;
create policy "event join requests readable by requester or managers"
on public.map_event_join_requests for select
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
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
create policy "join requests deleted by requester or managers"
on public.map_event_join_requests for delete
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users leave map events" on public.map_event_participants;
drop policy if exists "event owners and moderators remove participants" on public.map_event_participants;
create policy "participants leave own map events"
on public.map_event_participants for delete
to authenticated
using (user_uid = auth.uid());

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
check (distance_meters between 0 and 30);

drop policy if exists "profile_crossings_insert_own" on public.profile_crossings;
create policy "profile_crossings_insert_own"
on public.profile_crossings
for insert
with check (
  auth.uid() = user_uid
  and distance_meters between 0 and 30
);

drop policy if exists "profile_crossings_update_own" on public.profile_crossings;
create policy "profile_crossings_update_own"
on public.profile_crossings
for update
using (auth.uid() = user_uid)
with check (
  auth.uid() = user_uid
  and distance_meters between 0 and 30
);

notify pgrst, 'reload schema';
