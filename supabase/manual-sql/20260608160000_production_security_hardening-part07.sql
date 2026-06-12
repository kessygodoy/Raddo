
create or replace function public.delete_match_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_match_id text;
  latest_message text;
  latest_message_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select match_id into target_match_id
  from public.messages
  where id = target_message_id
    and sender_uid = auth.uid();

  if target_match_id is null then raise exception 'not allowed'; end if;

  delete from public.messages
  where id = target_message_id
    and sender_uid = auth.uid();

  select text, created_at into latest_message, latest_message_at
  from public.messages
  where match_id = target_match_id
  order by created_at desc
  limit 1;

  update public.matches
  set last_message = coalesce(latest_message, ''),
      last_message_at = latest_message_at
  where id = target_match_id;
end;
$$;


create or replace function public.delete_map_event_message(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event_id uuid;
  target_sender_uid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select event_id, sender_uid into target_event_id, target_sender_uid
  from public.map_event_messages
  where id = target_message_id;

  if target_event_id is null then raise exception 'message not found'; end if;

  if target_sender_uid <> auth.uid() and not public.user_can_manage_map_event(target_event_id) then
    raise exception 'not allowed';
  end if;

  delete from public.map_event_messages
  where id = target_message_id;
end;
$$;


create or replace function public.mark_match_image_viewed(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

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

  if not found then raise exception 'message not found or not allowed'; end if;
end;
$$;
