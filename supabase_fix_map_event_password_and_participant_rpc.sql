create or replace function public.is_map_event_participant(target_event_id uuid, target_user_uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.map_event_participants
    where event_id = target_event_id
      and user_uid = target_user_uid
  );
$$;

grant execute on function public.is_map_event_participant(uuid, uuid) to authenticated;

create or replace function public.update_map_event_password(target_event_id uuid, target_password_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(length(target_password_hash), 0) < 12 then
    raise exception 'invalid password hash';
  end if;

  if not public.user_can_manage_map_event(target_event_id) then
    raise exception 'not allowed';
  end if;

  update public.map_events
  set access_mode = 'password',
      password_hash = target_password_hash
  where id = target_event_id;
end;
$$;

grant execute on function public.update_map_event_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
