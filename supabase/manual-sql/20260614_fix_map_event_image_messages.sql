alter table public.map_event_messages
  drop constraint if exists map_event_messages_image_fields_check;

alter table public.map_event_messages
  add constraint map_event_messages_image_fields_check
  check (
    (message_type = 'text' and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and coalesce(nullif(image_path, ''), nullif(image_url, '')) is not null and length(image_url) <= 2048 and length(image_path) <= 512)
  );

create or replace function public.send_map_event_message_secure(
  target_event_id uuid,
  message_text text,
  message_type_value text default 'text',
  image_url_value text default '',
  image_path_value text default '',
  view_once_value boolean default false
) returns table(id uuid)
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
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if clean_type = 'image' and clean_text is null then clean_text := 'Imagem'; end if;
  if clean_text is null then raise exception 'Mensagem vazia.'; end if;
  if length(clean_text) > 1000 then raise exception 'Mensagem muito longa.'; end if;

  if clean_type = 'text' then
    clean_image_url := '';
    clean_image_path := '';
    view_once_value := false;
  else
    if clean_image_path = '' then clean_image_path := clean_image_url; end if;
    if clean_image_url = '' then clean_image_url := clean_image_path; end if;
    if clean_image_path = '' or length(clean_image_url) > 2048 or length(clean_image_path) > 512 then
      raise exception 'Midia invalida.';
    end if;
  end if;

  if exists (select 1 from public.map_event_bans where event_id = target_event_id and user_uid = auth.uid()) then
    raise exception 'Voce foi banido deste chat.';
  end if;
  if not exists (select 1 from public.map_event_participants where event_id = target_event_id and user_uid = auth.uid()) then
    raise exception 'Voce nao participa deste chat.';
  end if;
  if clean_type = 'text' and exists (
    select 1 from public.map_event_messages
    where event_id = target_event_id and sender_uid = auth.uid()
      and created_at > now() - interval '60 seconds'
      and lower(btrim(text)) = lower(clean_text)
  ) then
    perform public.raddo_log_spam(auth.uid(), 'map_chat', target_event_id, 'repeated_message');
    raise exception 'Mensagem repetida. Aguarde um instante.';
  end if;
  if (select count(*) from public.map_event_messages where event_id = target_event_id and sender_uid = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    perform public.raddo_log_spam(auth.uid(), 'map_chat', target_event_id, 'message_burst');
    raise exception 'Muitas mensagens seguidas. Aguarde um instante.';
  end if;

  insert into public.map_event_messages (event_id, sender_uid, sender_name, text, message_type, image_url, image_path, view_once, viewed_by, created_at)
  select target_event_id, auth.uid(), coalesce(p.display_name, 'Raddo'), clean_text, clean_type, clean_image_url, clean_image_path, coalesce(view_once_value, false), '{}', now()
  from public.profiles p
  where p.id = auth.uid()
  returning map_event_messages.id into inserted_id;

  return query select inserted_id;
end;
$$;

grant execute on function public.send_map_event_message_secure(uuid, text, text, text, text, boolean) to authenticated;
