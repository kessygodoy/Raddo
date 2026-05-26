create table if not exists public.app_moderators (
  user_uid uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_bans (
  banned_uid uuid primary key references auth.users(id) on delete cascade,
  banned_by_uid uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'violacao_das_regras',
  created_at timestamptz not null default now(),
  check (banned_uid <> banned_by_uid)
);

alter table public.app_moderators enable row level security;
alter table public.app_bans enable row level security;

create or replace function public.is_app_moderator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_moderators
    where user_uid = auth.uid()
      and role in ('admin', 'moderator')
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_moderators
    where user_uid = auth.uid()
      and role = 'admin'
  );
$$;

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

drop policy if exists "users read own app ban" on public.app_bans;
create policy "users read own app ban"
on public.app_bans for select
to authenticated
using (banned_uid = auth.uid() or public.is_app_moderator());

drop policy if exists "moderators create app bans" on public.app_bans;
create policy "moderators create app bans"
on public.app_bans for insert
to authenticated
with check (public.is_app_moderator() and banned_by_uid = auth.uid());

drop policy if exists "moderators update app bans" on public.app_bans;
create policy "moderators update app bans"
on public.app_bans for update
to authenticated
using (public.is_app_moderator())
with check (public.is_app_moderator());

drop policy if exists "admins delete app bans" on public.app_bans;
create policy "admins delete app bans"
on public.app_bans for delete
to authenticated
using (public.is_app_admin());

grant select, insert, update, delete on public.app_moderators to authenticated;
grant select, insert, update, delete on public.app_bans to authenticated;
grant execute on function public.is_app_moderator() to authenticated;
grant execute on function public.is_app_admin() to authenticated;

notify pgrst, 'reload schema';

-- Depois de rodar este arquivo, torne seu usuário admin substituindo o UID:
-- insert into public.app_moderators (user_uid, role)
-- values ('SEU_UID_AQUI', 'admin')
-- on conflict (user_uid) do update set role = excluded.role;
