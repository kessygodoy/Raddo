
create or replace function public.mark_map_event_image_viewed(target_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

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

  if not found then raise exception 'message not found or not allowed'; end if;
end;
$$;


grant execute on function public.send_match_message(text, text, text, text, text, boolean) to authenticated;

grant execute on function public.send_map_event_message_secure(uuid, text, text, text, text, boolean) to authenticated;

grant execute on function public.edit_match_message(uuid, text) to authenticated;

grant execute on function public.edit_map_event_message(uuid, text) to authenticated;

grant execute on function public.delete_match_message(uuid) to authenticated;

grant execute on function public.delete_map_event_message(uuid) to authenticated;

grant execute on function public.mark_match_image_viewed(uuid) to authenticated;

grant execute on function public.mark_map_event_image_viewed(uuid) to authenticated;


revoke update, delete on public.messages from authenticated;

revoke update, delete on public.map_event_messages from authenticated;


drop policy if exists "match members update message views" on public.messages;

drop policy if exists "match members update messages" on public.messages;

drop policy if exists "match senders edit own text messages" on public.messages;

drop policy if exists "match members mark images as viewed" on public.messages;

drop policy if exists "match members delete own messages" on public.messages;

drop policy if exists "match senders delete own messages" on public.messages;


drop policy if exists "event participants update message views" on public.map_event_messages;

drop policy if exists "event message senders and participants update messages" on public.map_event_messages;

drop policy if exists "event participants mark images as viewed" on public.map_event_messages;

drop policy if exists "event message senders and managers delete messages" on public.map_event_messages;


update storage.buckets
set public = false
where id = 'profile-photos';


drop policy if exists "profile photos are public" on storage.objects;

drop policy if exists "public read profile photos" on storage.objects;

drop policy if exists "anyone can read profile photos" on storage.objects;

drop policy if exists "authenticated users read profile photos" on storage.objects;

drop policy if exists "authenticated users read safe profile uploads" on storage.objects;
