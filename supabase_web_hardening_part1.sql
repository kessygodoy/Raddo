-- Web hardening 1/3: logs, moderacao e banimentos.

alter table public.push_delivery_logs enable row level security;
drop policy if exists "authenticated users read push delivery logs" on public.push_delivery_logs;
drop policy if exists "moderators read push delivery logs" on public.push_delivery_logs;
create policy "moderators read push delivery logs"
on public.push_delivery_logs for select
to authenticated
using (public.is_app_moderator());

alter table public.app_moderators enable row level security;
drop policy if exists "users read own moderation role" on public.app_moderators;
create policy "users read own moderation role"
on public.app_moderators for select
to authenticated
using (user_uid = auth.uid() or public.is_app_moderator());

drop policy if exists "admins manage app moderators" on public.app_moderators;
create policy "admins manage app moderators"
on public.app_moderators for all
to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

alter table public.app_bans enable row level security;
drop policy if exists "users read own app ban" on public.app_bans;
drop policy if exists "moderators read app bans" on public.app_bans;
create policy "users and moderators read app bans"
on public.app_bans for select
to authenticated
using (banned_uid = auth.uid() or public.is_app_moderator());

notify pgrst, 'reload schema';
