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
  clean_text text := nullif(trim(message_text), '');
  inserted_id uuid;
begin
  if clean_text is null then raise exception 'Mensagem vazia.'; end if;
  if exists (select 1 from public.map_event_bans where event_id = target_event_id and user_uid = auth.uid()) then
    raise exception 'Voce foi banido deste chat.';
  end if;
  if not exists (select 1 from public.map_event_participants where event_id = target_event_id and user_uid = auth.uid()) then
    raise exception 'Voce nao participa deste chat.';
  end if;
  if exists (
    select 1 from public.map_event_messages
    where event_id = target_event_id and sender_uid = auth.uid()
      and created_at > now() - interval '60 seconds'
      and lower(trim(text)) = lower(clean_text)
  ) then
    perform public.raddo_log_spam(auth.uid(), 'map_chat', target_event_id, 'repeated_message');
    raise exception 'Mensagem repetida. Aguarde um instante.';
  end if;
  if (select count(*) from public.map_event_messages where event_id = target_event_id and sender_uid = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    perform public.raddo_log_spam(auth.uid(), 'map_chat', target_event_id, 'message_burst');
    raise exception 'Muitas mensagens seguidas. Aguarde um instante.';
  end if;
  insert into public.map_event_messages (event_id, sender_uid, sender_name, text, message_type, image_url, image_path, view_once, viewed_by, created_at)
  select target_event_id, auth.uid(), coalesce(p.display_name, 'Raddo'), clean_text, message_type_value, image_url_value, image_path_value, view_once_value, '{}', now()
  from public.profiles p where p.id = auth.uid()
  returning map_event_messages.id into inserted_id;
  return query select inserted_id;
end;
$$;

grant execute on function public.send_map_event_message_secure(uuid, text, text, text, text, boolean) to authenticated;

create table if not exists public.event_suggestions (
  id uuid primary key default gen_random_uuid(),
  center_lat double precision not null,
  center_lng double precision not null,
  interest text not null,
  nearby_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

alter table public.event_suggestions enable row level security;

drop policy if exists "authenticated read active event suggestions" on public.event_suggestions;
create policy "authenticated read active event suggestions"
on public.event_suggestions for select
to authenticated
using (expires_at > now());
