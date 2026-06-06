create or replace function public.ban_app_user(
  target_banned_uid uuid,
  target_reason text default 'violacao_das_regras'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_moderator() then
    raise exception 'Apenas moderadores podem banir usuarios.';
  end if;
  if target_banned_uid = auth.uid() then
    raise exception 'Voce nao pode banir sua propria conta.';
  end if;

  insert into public.app_bans (banned_uid, banned_by_uid, reason, created_at)
  values (target_banned_uid, auth.uid(), coalesce(nullif(trim(target_reason), ''), 'violacao_das_regras'), now())
  on conflict (banned_uid)
  do update set
    banned_by_uid = excluded.banned_by_uid,
    reason = excluded.reason,
    created_at = excluded.created_at;
end;
$$;

create or replace function public.unban_app_user(target_banned_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_moderator() then
    raise exception 'Apenas moderadores podem desbanir usuarios.';
  end if;
  delete from public.app_bans where banned_uid = target_banned_uid;
end;
$$;

grant execute on function public.ban_app_user(uuid, text) to authenticated;
grant execute on function public.unban_app_user(uuid) to authenticated;

drop policy if exists "moderators read app bans" on public.app_bans;
create policy "moderators read app bans"
on public.app_bans for select
to authenticated
using (public.is_app_moderator());

notify pgrst, 'reload schema';
