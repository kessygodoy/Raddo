drop policy if exists "event owners and moderators update map events"
on public.map_events;

create policy "event owners and moderators update map events"
on public.map_events
for update
to authenticated
using (public.user_can_manage_map_event(id))
with check (public.user_can_manage_map_event(id));
