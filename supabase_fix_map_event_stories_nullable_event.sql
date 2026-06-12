alter table public.map_event_stories
  alter column event_id drop not null;

alter table public.map_event_stories
  add column if not exists liked_by uuid[] not null default '{}',
  add column if not exists viewed_by uuid[] not null default '{}';

notify pgrst, 'reload schema';
