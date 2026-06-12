alter table public.map_event_stories
  add column if not exists media_type text not null default 'image';

alter table public.map_event_stories
  drop constraint if exists map_event_stories_media_type_check;

alter table public.map_event_stories
  add constraint map_event_stories_media_type_check check (media_type in ('image', 'video'));

notify pgrst, 'reload schema';
