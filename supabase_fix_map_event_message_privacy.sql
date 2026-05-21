drop policy if exists "event messages are readable" on public.map_event_messages;
create policy "event messages are readable"
on public.map_event_messages for select
to authenticated
using (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
      and map_event_messages.created_at >= map_event_participants.joined_at
  )
);

drop policy if exists "authenticated users send event messages" on public.map_event_messages;
create policy "authenticated users send event messages"
on public.map_event_messages for insert
to authenticated
with check (
  auth.uid() = sender_uid
  and exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
      and map_event_messages.created_at >= map_event_participants.joined_at
  )
);
