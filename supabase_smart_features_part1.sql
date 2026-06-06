create table if not exists public.anti_spam_events (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references public.profiles(id) on delete cascade,
  context_type text not null,
  context_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.anti_spam_events enable row level security;

drop policy if exists "moderators read anti spam events" on public.anti_spam_events;
create policy "moderators read anti spam events"
on public.anti_spam_events for select
to authenticated
using (public.is_app_moderator());

create or replace function public.raddo_log_spam(
  target_user_uid uuid,
  target_context_type text,
  target_context_id uuid,
  target_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.anti_spam_events (user_uid, context_type, context_id, reason)
  values (target_user_uid, target_context_type, target_context_id, target_reason);
end;
$$;

create or replace function public.send_match_message(
  target_match_id uuid,
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
  if not exists (select 1 from public.matches m where m.id = target_match_id and auth.uid() = any(m.users)) then
    raise exception 'Voce nao participa desta conversa.';
  end if;
  if exists (
    select 1 from public.messages
    where match_id = target_match_id and sender_uid = auth.uid()
      and created_at > now() - interval '60 seconds'
      and lower(trim(text)) = lower(clean_text)
  ) then
    perform public.raddo_log_spam(auth.uid(), 'match_chat', target_match_id, 'repeated_message');
    raise exception 'Mensagem repetida. Aguarde um instante.';
  end if;
  if (select count(*) from public.messages where match_id = target_match_id and sender_uid = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    perform public.raddo_log_spam(auth.uid(), 'match_chat', target_match_id, 'message_burst');
    raise exception 'Muitas mensagens seguidas. Aguarde um instante.';
  end if;
  insert into public.messages (sender_uid, text, match_id, message_type, image_url, image_path, view_once, viewed_by, created_at)
  values (auth.uid(), clean_text, target_match_id, message_type_value, image_url_value, image_path_value, view_once_value, '{}', now())
  returning messages.id into inserted_id;
  update public.matches set last_message = clean_text, last_message_at = now() where matches.id = target_match_id;
  return query select inserted_id;
end;
$$;

grant execute on function public.send_match_message(uuid, text, text, text, text, boolean) to authenticated;
