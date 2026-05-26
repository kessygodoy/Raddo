alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists image_url text not null default '',
  add column if not exists image_path text not null default '',
  add column if not exists view_once boolean not null default false,
  add column if not exists viewed_by uuid[] not null default '{}';

alter table public.map_event_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists image_url text not null default '',
  add column if not exists image_path text not null default '',
  add column if not exists view_once boolean not null default false,
  add column if not exists viewed_by uuid[] not null default '{}';

drop policy if exists "match members update message views" on public.messages;
create policy "match members update message views"
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

drop policy if exists "event participants update message views" on public.map_event_messages;
create policy "event participants update message views"
on public.map_event_messages for update
to authenticated
using (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_messages.event_id
      and map_event_participants.user_uid = auth.uid()
  )
);

grant update on public.messages to authenticated;
grant update on public.map_event_messages to authenticated;

notify pgrst, 'reload schema';
