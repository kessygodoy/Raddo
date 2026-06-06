alter table public.reports
  add column if not exists context_type text not null default 'profile',
  add column if not exists context_id text not null default '',
  add column if not exists context_title text not null default '',
  add column if not exists recent_messages jsonb not null default '[]'::jsonb;

alter table public.image_moderation_reports
  add column if not exists recent_messages jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
