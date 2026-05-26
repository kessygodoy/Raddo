alter table public.reports
  add column if not exists recent_messages jsonb not null default '[]'::jsonb;

alter table public.image_moderation_reports
  add column if not exists recent_messages jsonb not null default '[]'::jsonb;
