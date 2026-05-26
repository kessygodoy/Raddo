alter table public.image_moderation_reports
  add column if not exists owner_email text not null default '',
  add column if not exists owner_display_name text not null default '';

drop policy if exists "match members delete own messages" on public.messages;
create policy "match members delete own messages"
on public.messages for delete
to authenticated
using (sender_uid = auth.uid());

drop policy if exists "match senders edit own text messages" on public.messages;
create policy "match senders edit own text messages"
on public.messages for update
to authenticated
using (
  sender_uid = auth.uid()
  or exists (
    select 1 from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
)
with check (
  sender_uid = auth.uid()
  or exists (
    select 1 from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
);

drop policy if exists "event message senders and managers delete messages" on public.map_event_messages;
create policy "event message senders and managers delete messages"
on public.map_event_messages for delete
to authenticated
using (
  sender_uid = auth.uid()
  or exists (
    select 1 from public.map_events
    where map_events.id = map_event_messages.event_id
      and map_events.creator_uid = auth.uid()
  )
  or exists (
    select 1 from public.map_event_moderators
    where map_event_moderators.event_id = map_event_messages.event_id
      and map_event_moderators.user_uid = auth.uid()
  )
);

drop policy if exists "event message senders and participants update messages" on public.map_event_messages;
create policy "event message senders and participants update messages"
on public.map_event_messages for update
to authenticated
using (
  sender_uid = auth.uid()
  or exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
)
with check (
  sender_uid = auth.uid()
  or exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
);

grant delete, update on public.messages to authenticated;
grant delete, update on public.map_event_messages to authenticated;

notify pgrst, 'reload schema';
