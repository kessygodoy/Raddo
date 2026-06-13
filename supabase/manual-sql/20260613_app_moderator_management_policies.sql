drop policy if exists "event owners moderators and app moderators update map events"
on public.map_events;

create policy "event owners moderators and app moderators update map events"
on public.map_events
for update
to authenticated
using (public.user_can_manage_map_event(id) or public.is_app_moderator())
with check (public.user_can_manage_map_event(id) or public.is_app_moderator());

drop policy if exists "event owners moderators and app moderators delete map events"
on public.map_events;

create policy "event owners moderators and app moderators delete map events"
on public.map_events
for delete
to authenticated
using (public.user_can_manage_map_event(id) or public.is_app_moderator());

drop policy if exists "story owners and app moderators delete stories"
on public.map_event_stories;

create policy "story owners and app moderators delete stories"
on public.map_event_stories
for delete
to authenticated
using (creator_uid = auth.uid() or public.is_app_moderator());

drop policy if exists "event managers and app moderators delete messages"
on public.map_event_messages;

create policy "event managers and app moderators delete messages"
on public.map_event_messages
for delete
to authenticated
using (sender_uid = auth.uid() or public.user_can_manage_map_event(event_id) or public.is_app_moderator());
