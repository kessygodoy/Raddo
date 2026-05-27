-- Corrige persistência de imagens "ver uma vez".
-- Rode este arquivo no SQL Editor do Supabase.

create or replace function public.mark_match_image_viewed(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.messages
  set viewed_by = case
    when auth.uid() = any(coalesce(viewed_by, '{}'::uuid[])) then coalesce(viewed_by, '{}'::uuid[])
    else array_append(coalesce(viewed_by, '{}'::uuid[]), auth.uid())
  end
  where id = target_message_id
    and message_type = 'image'
    and view_once = true
    and sender_uid <> auth.uid()
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and auth.uid() = any(matches.users)
    );

  if not found then
    raise exception 'message not found or not allowed';
  end if;
end;
$$;

create or replace function public.mark_map_event_image_viewed(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.map_event_messages
  set viewed_by = case
    when auth.uid() = any(coalesce(viewed_by, '{}'::uuid[])) then coalesce(viewed_by, '{}'::uuid[])
    else array_append(coalesce(viewed_by, '{}'::uuid[]), auth.uid())
  end
  where id = target_message_id
    and message_type = 'image'
    and view_once = true
    and sender_uid <> auth.uid()
    and exists (
      select 1
      from public.map_event_participants
      where map_event_participants.event_id = map_event_messages.event_id
        and map_event_participants.user_uid = auth.uid()
        and map_event_messages.created_at >= map_event_participants.joined_at
    );

  if not found then
    raise exception 'message not found or not allowed';
  end if;
end;
$$;

grant execute on function public.mark_match_image_viewed(uuid) to authenticated;
grant execute on function public.mark_map_event_image_viewed(uuid) to authenticated;

notify pgrst, 'reload schema';
