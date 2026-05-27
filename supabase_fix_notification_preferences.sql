create table if not exists public.notification_preferences (
  user_uid uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  connections boolean not null default true,
  connection_messages boolean not null default true,
  map_chats boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
on public.notification_preferences for select
to authenticated
using (auth.uid() = user_uid);

drop policy if exists "users create own notification preferences" on public.notification_preferences;
create policy "users create own notification preferences"
on public.notification_preferences for insert
to authenticated
with check (auth.uid() = user_uid);

drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences"
on public.notification_preferences for update
to authenticated
using (auth.uid() = user_uid)
with check (auth.uid() = user_uid);

grant select, insert, update on public.notification_preferences to authenticated;
