create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.device_push_tokens;
create policy "users read own push tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_uid);

drop policy if exists "users insert own push tokens" on public.device_push_tokens;
create policy "users insert own push tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_uid);

drop policy if exists "users update own push tokens" on public.device_push_tokens;
create policy "users update own push tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_uid)
  with check (auth.uid() = user_uid);

drop policy if exists "users delete own push tokens" on public.device_push_tokens;
create policy "users delete own push tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_uid);
