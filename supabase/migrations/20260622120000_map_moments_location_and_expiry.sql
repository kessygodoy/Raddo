alter table public.map_event_stories
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

alter table public.map_event_stories
  alter column expires_at set default (now() + interval '2 hours');

alter table public.map_event_stories
  drop constraint if exists map_event_stories_location_pair_check;

alter table public.map_event_stories
  add constraint map_event_stories_location_pair_check check (
    (location_lat is null and location_lng is null)
    or
    (location_lat between -90 and 90 and location_lng between -180 and 180)
  );

update public.map_event_stories
set expires_at = least(expires_at, created_at + interval '2 hours')
where expires_at > created_at + interval '2 hours';

drop policy if exists "participants create map event stories" on public.map_event_stories;
create policy "participants create map event stories"
on public.map_event_stories for insert
to authenticated
with check (
  creator_uid = auth.uid()
  and expires_at <= now() + interval '2 hours'
  and (
    (event_id is null and location_lat is not null and location_lng is not null)
    or exists (
      select 1
      from public.map_event_participants
      where map_event_participants.event_id = map_event_stories.event_id
        and map_event_participants.user_uid = auth.uid()
    )
  )
);

create index if not exists map_event_stories_location_expiry_idx
on public.map_event_stories (expires_at desc, location_lat, location_lng)
where location_lat is not null and location_lng is not null;
