
drop policy if exists "authenticated users manage event join requests" on public.map_event_join_requests;

drop policy if exists "event owners and moderators manage event join requests" on public.map_event_join_requests;

drop policy if exists "join requests deleted by requester or managers" on public.map_event_join_requests;

create policy "join requests deleted by requester or managers"
on public.map_event_join_requests for delete
to authenticated
using (user_uid = auth.uid() or public.user_can_manage_map_event(event_id));


create or replace function public.send_match_message(
  target_match_id text,
  message_text text,
  message_type_value text default 'text',
  image_url_value text default '',
  image_path_value text default '',
  view_once_value boolean default false
)
returns table(id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_text text := nullif(btrim(coalesce(message_text, '')), '');
  clean_type text := case when message_type_value = 'image' then 'image' else 'text' end;
  clean_image_url text := btrim(coalesce(image_url_value, ''));
  clean_image_path text := btrim(coalesce(image_path_value, ''));
  inserted_id uuid;
  inserted_created_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if clean_type = 'image' and clean_text is null then clean_text := 'Imagem'; end if;
  if clean_text is null then raise exception 'empty message'; end if;
  if length(clean_text) > 1000 then raise exception 'message too long'; end if;
  if clean_type = 'text' then
    clean_image_url := '';
    clean_image_path := '';
    view_once_value := false;
  elsif clean_image_url = '' or length(clean_image_url) > 2048 or length(clean_image_path) > 512 then
    raise exception 'invalid media';
  end if;

  if not exists (
    select 1 from public.matches
    where matches.id = target_match_id
      and auth.uid() = any(matches.users)
  ) then
    raise exception 'match not found or not allowed';
  end if;

  insert into public.messages (sender_uid, text, match_id, message_type, image_url, image_path, view_once, viewed_by, created_at)
  values (auth.uid(), clean_text, target_match_id, clean_type, clean_image_url, clean_image_path, coalesce(view_once_value, false), '{}', now())
  returning messages.id, messages.created_at into inserted_id, inserted_created_at;

  update public.matches
  set last_message = clean_text,
      last_message_at = inserted_created_at
  where matches.id = target_match_id;

  return query select inserted_id, inserted_created_at;
end;
$$;
