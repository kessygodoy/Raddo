drop policy if exists "event owners add moderators" on public.map_event_moderators;

create policy "event owners add moderators"
on public.map_event_moderators for insert
to authenticated
with check (
  exists (
    select 1
    from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
      and map_event_moderators.user_uid <> auth.uid()
  )
);


drop policy if exists "event owners remove moderators" on public.map_event_moderators;

create policy "event owners remove moderators"
on public.map_event_moderators for delete
to authenticated
using (
  exists (
    select 1
    from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
  )
);


drop policy if exists "event bans are readable" on public.map_event_bans;

drop policy if exists "event bans readable by banned user or managers" on public.map_event_bans;

create policy "event bans readable by banned user or managers"
on public.map_event_bans for select
to authenticated
using (user_uid = auth.uid() or public.user_can_manage_map_event(event_id));


drop policy if exists "authenticated users manage event bans" on public.map_event_bans;

drop policy if exists "authenticated users create event bans" on public.map_event_bans;

drop policy if exists "authenticated users remove event bans" on public.map_event_bans;

drop policy if exists "event owners and moderators create bans" on public.map_event_bans;

create policy "event owners and moderators create bans"
on public.map_event_bans for insert
to authenticated
with check (
  banned_by_uid = auth.uid()
  and user_uid <> auth.uid()
  and public.user_can_manage_map_event(event_id)
);


drop policy if exists "event owners and moderators remove bans" on public.map_event_bans;

create policy "event owners and moderators remove bans"
on public.map_event_bans for delete
to authenticated
using (public.user_can_manage_map_event(event_id));


drop policy if exists "event join requests are readable" on public.map_event_join_requests;

drop policy if exists "event join requests readable by requester or managers" on public.map_event_join_requests;

create policy "event join requests readable by requester or managers"
on public.map_event_join_requests for select
to authenticated
using (user_uid = auth.uid() or public.user_can_manage_map_event(event_id));


drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;

drop policy if exists "users create own join requests" on public.map_event_join_requests;

create policy "users create own join requests"
on public.map_event_join_requests for insert
to authenticated
with check (
  user_uid = auth.uid()
  and not exists (
    select 1
    from public.map_event_bans
    where map_event_bans.event_id = map_event_join_requests.event_id
      and map_event_bans.user_uid = auth.uid()
  )
);
