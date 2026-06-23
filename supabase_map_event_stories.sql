create table if not exists public.map_event_stories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.map_events(id) on delete cascade,
  creator_uid uuid not null references auth.users(id) on delete cascade,
  creator_name text not null default 'Raddo',
  image_url text not null default '',
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  liked_by uuid[] not null default '{}',
  viewed_by uuid[] not null default '{}',
  text text not null default '',
  location_lat double precision,
  location_lng double precision,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  constraint map_event_stories_content_check check (image_url <> '' or length(trim(text)) > 0)
);

alter table public.map_event_stories
  add column if not exists media_type text not null default 'image';

alter table public.map_event_stories
  drop constraint if exists map_event_stories_media_type_check;

alter table public.map_event_stories
  add constraint map_event_stories_media_type_check check (media_type in ('image', 'video'));

alter table public.map_event_stories enable row level security;

drop policy if exists "authenticated read active map event stories" on public.map_event_stories;
create policy "authenticated read active map event stories"
on public.map_event_stories for select
to authenticated
using (
  expires_at > now()
  and (
    event_id is null
    or
    exists (
      select 1 from public.map_event_participants
      where map_event_participants.event_id = map_event_stories.event_id
        and map_event_participants.user_uid = auth.uid()
    )
    or exists (
    select 1 from public.map_events
    where map_events.id = map_event_stories.event_id
      and map_events.access_mode = 'open'
    )
  )
);

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
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_event_stories.event_id
      and map_event_participants.user_uid = auth.uid()
    )
  )
);

drop policy if exists "users delete own map event stories" on public.map_event_stories;
create policy "users delete own map event stories"
on public.map_event_stories for delete
to authenticated
using (creator_uid = auth.uid() or public.user_can_manage_map_event(event_id));

create index if not exists map_event_stories_event_recent_idx
on public.map_event_stories (event_id, created_at desc);

create index if not exists map_event_stories_active_idx
on public.map_event_stories (expires_at desc);

create or replace function public.toggle_map_event_story_like(target_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_liked_by uuid[];
begin
  select liked_by into current_liked_by
  from public.map_event_stories
  where id = target_story_id
    and expires_at > now();

  if current_liked_by is null then
    raise exception 'Story nao encontrado.';
  end if;

  if auth.uid() = any(current_liked_by) then
    update public.map_event_stories
    set liked_by = array_remove(liked_by, auth.uid())
    where id = target_story_id;
  else
    update public.map_event_stories
    set liked_by = array_append(liked_by, auth.uid())
    where id = target_story_id;
  end if;
end;
$$;

grant execute on function public.toggle_map_event_story_like(uuid) to authenticated;

create or replace function public.mark_map_event_story_viewed(target_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.map_event_stories
  set viewed_by = array_append(viewed_by, auth.uid())
  where id = target_story_id
    and expires_at > now()
    and creator_uid <> auth.uid()
    and not auth.uid() = any(viewed_by);
end;
$$;

grant execute on function public.mark_map_event_story_viewed(uuid) to authenticated;

notify pgrst, 'reload schema';
