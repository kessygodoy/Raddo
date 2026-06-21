-- Add trusted centered system messages whenever a participant joins a map chat.

alter table public.map_event_messages
  drop constraint if exists map_event_messages_message_type_check,
  drop constraint if exists map_event_messages_image_fields_check;

alter table public.map_event_messages
  add constraint map_event_messages_message_type_check
  check (message_type in ('text', 'image', 'system'));

alter table public.map_event_messages
  add constraint map_event_messages_image_fields_check
  check (
    (message_type in ('text', 'system') and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and image_url <> '' and length(image_url) <= 2048 and length(image_path) <= 512)
  );

create or replace function public.add_map_chat_join_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_name text;
begin
  select coalesce(nullif(btrim(display_name), ''), 'Uma pessoa')
  into participant_name
  from public.profiles
  where id = new.user_uid;

  insert into public.map_event_messages (
    event_id,
    sender_uid,
    sender_name,
    text,
    message_type,
    image_url,
    image_path,
    view_once,
    viewed_by,
    created_at
  ) values (
    new.event_id,
    new.user_uid,
    coalesce(participant_name, 'Uma pessoa'),
    coalesce(participant_name, 'Uma pessoa') || ' entrou no chat',
    'system',
    '',
    '',
    false,
    '{}',
    coalesce(new.joined_at, now())
  );

  return new;
end;
$$;

drop trigger if exists map_chat_participant_join_message on public.map_event_participants;
create trigger map_chat_participant_join_message
after insert on public.map_event_participants
for each row execute function public.add_map_chat_join_message();
