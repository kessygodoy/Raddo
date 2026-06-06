-- Web hardening 2/3: tokens, preferencias e dados sensiveis de push.

alter table public.device_push_tokens enable row level security;
drop policy if exists "users read own push tokens" on public.device_push_tokens;
create policy "users read own push tokens"
on public.device_push_tokens for select
to authenticated
using (auth.uid() = user_uid);

drop policy if exists "users insert own push tokens" on public.device_push_tokens;
create policy "users insert own push tokens"
on public.device_push_tokens for insert
to authenticated
with check (auth.uid() = user_uid);

drop policy if exists "users update own push tokens" on public.device_push_tokens;
create policy "users update own push tokens"
on public.device_push_tokens for update
to authenticated
using (auth.uid() = user_uid)
with check (auth.uid() = user_uid);

drop policy if exists "users delete own push tokens" on public.device_push_tokens;
create policy "users delete own push tokens"
on public.device_push_tokens for delete
to authenticated
using (auth.uid() = user_uid);

alter table public.notification_preferences enable row level security;
drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
on public.notification_preferences for select
to authenticated
using (auth.uid() = user_uid);

notify pgrst, 'reload schema';
