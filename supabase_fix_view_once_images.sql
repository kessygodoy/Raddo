alter table public.messages
  add column if not exists viewed_by text[] not null default '{}';

alter table public.map_event_messages
  add column if not exists viewed_by text[] not null default '{}';

drop policy if exists "match members mark images as viewed" on public.messages;
create policy "match members mark images as viewed"
on public.messages for update
to authenticated
using (
  exists (
    select 1 from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
)
with check (
  exists (
    select 1 from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
);

drop policy if exists "event participants mark images as viewed" on public.map_event_messages;
create policy "event participants mark images as viewed"
on public.map_event_messages for update
to authenticated
using (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
  or exists (
    select 1 from public.map_events
    where map_events.id = map_event_messages.event_id
      and map_events.creator_uid = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
  or exists (
    select 1 from public.map_events
    where map_events.id = map_event_messages.event_id
      and map_events.creator_uid = auth.uid()
  )
);

grant update on public.messages to authenticated;
grant update on public.map_event_messages to authenticated;

notify pgrst, 'reload schema';
