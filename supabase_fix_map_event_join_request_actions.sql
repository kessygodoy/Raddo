-- Corrige os botões Aprovar e Recusar pedidos de entrada em chats do mapa.
-- Rode este arquivo no SQL Editor do Supabase.

create or replace function public.user_can_manage_map_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.map_events
        where id = target_event_id
          and creator_uid = auth.uid()
      )
      or exists (
        select 1
        from public.map_event_moderators
        where event_id = target_event_id
          and user_uid = auth.uid()
      )
    );
$$;

create or replace function public.approve_map_event_request(target_event_id uuid, target_user_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_can_manage_map_event(target_event_id) then
    raise exception 'not allowed';
  end if;

  if exists (
    select 1
    from public.map_event_bans
    where event_id = target_event_id
      and user_uid = target_user_uid
  ) then
    raise exception 'user is banned';
  end if;

  insert into public.map_event_participants (event_id, user_uid, joined_at)
  values (target_event_id, target_user_uid, now())
  on conflict (event_id, user_uid) do update
    set joined_at = excluded.joined_at;

  delete from public.map_event_join_requests
  where event_id = target_event_id
    and user_uid = target_user_uid;
end;
$$;

create or replace function public.reject_map_event_request(target_event_id uuid, target_user_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_can_manage_map_event(target_event_id) then
    raise exception 'not allowed';
  end if;

  delete from public.map_event_join_requests
  where event_id = target_event_id
    and user_uid = target_user_uid;
end;
$$;

grant execute on function public.user_can_manage_map_event(uuid) to authenticated;
grant execute on function public.approve_map_event_request(uuid, uuid) to authenticated;
grant execute on function public.reject_map_event_request(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
