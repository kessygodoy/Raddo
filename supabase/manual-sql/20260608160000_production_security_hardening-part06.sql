
create or replace function public.edit_match_message(target_message_id uuid, next_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_text text := nullif(btrim(coalesce(next_text, '')), '');
  target_match_id text;
  target_created_at timestamptz;
  current_last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if clean_text is null then raise exception 'empty message'; end if;
  if length(clean_text) > 1000 then raise exception 'message too long'; end if;

  select match_id, created_at into target_match_id, target_created_at
  from public.messages
  where id = target_message_id
    and sender_uid = auth.uid()
    and message_type = 'text';

  if target_match_id is null then raise exception 'message not found or not allowed'; end if;

  update public.messages
  set text = clean_text
  where id = target_message_id
    and sender_uid = auth.uid()
    and message_type = 'text';

  select last_message_at into current_last_at
  from public.matches
  where id = target_match_id;

  if current_last_at = target_created_at then
    update public.matches
    set last_message = clean_text
    where id = target_match_id;
  end if;
end;
$$;


create or replace function public.edit_map_event_message(target_message_id uuid, next_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_text text := nullif(btrim(coalesce(next_text, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if clean_text is null then raise exception 'Mensagem vazia.'; end if;
  if length(clean_text) > 1000 then raise exception 'Mensagem muito longa.'; end if;

  update public.map_event_messages
  set text = clean_text
  where id = target_message_id
    and sender_uid = auth.uid()
    and message_type = 'text';

  if not found then raise exception 'message not found or not allowed'; end if;
end;
$$;
