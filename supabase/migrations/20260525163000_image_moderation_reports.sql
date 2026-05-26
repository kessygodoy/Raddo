create table if not exists public.image_moderation_reports (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  owner_display_name text not null default '',
  bucket text not null,
  storage_path text not null,
  public_url text not null,
  context text not null default 'image',
  reasons text[] not null default '{}',
  safe_search jsonb not null default '{}'::jsonb,
  status text not null default 'pending_human_review',
  created_at timestamptz not null default now()
);

alter table public.image_moderation_reports enable row level security;

drop policy if exists "users read own image moderation reports" on public.image_moderation_reports;
create policy "users read own image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (auth.uid() = owner_uid);

grant select on public.image_moderation_reports to authenticated;
