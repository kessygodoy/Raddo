create table if not exists public.image_moderation_reports (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  owner_display_name text not null default '',
  bucket text not null default 'profile-photos',
  storage_path text not null,
  public_url text not null default '',
  context text not null default 'image',
  reasons text[] not null default '{}',
  recent_messages jsonb not null default '[]'::jsonb,
  safe_search jsonb not null default '{}'::jsonb,
  status text not null default 'pending_human_review',
  created_at timestamptz not null default now()
);

alter table public.image_moderation_reports
  add column if not exists owner_email text not null default '',
  add column if not exists owner_display_name text not null default '',
  add column if not exists bucket text not null default 'profile-photos',
  add column if not exists storage_path text,
  add column if not exists public_url text not null default '',
  add column if not exists context text not null default 'image',
  add column if not exists reasons text[] not null default '{}',
  add column if not exists recent_messages jsonb not null default '[]'::jsonb,
  add column if not exists safe_search jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'pending_human_review',
  add column if not exists created_at timestamptz not null default now();

alter table public.image_moderation_reports enable row level security;

drop policy if exists "users read own image moderation reports" on public.image_moderation_reports;
create policy "users read own image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (auth.uid() = owner_uid);

grant select on public.image_moderation_reports to authenticated;

notify pgrst, 'reload schema';
