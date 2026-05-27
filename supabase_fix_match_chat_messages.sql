alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists image_url text not null default '',
  add column if not exists image_path text not null default '',
  add column if not exists view_once boolean not null default false,
  add column if not exists viewed_by uuid[] not null default '{}';

grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.matches to authenticated;

drop policy if exists "match members read messages" on public.messages;
create policy "match members read messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
);

drop policy if exists "match members send messages" on public.messages;
create policy "match members send messages"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_uid
  and exists (
    select 1
    from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
);

drop policy if exists "match members update messages" on public.messages;
create policy "match members update messages"
on public.messages for update
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
)
with check (
  exists (
    select 1
    from public.matches
    where matches.id = messages.match_id
      and auth.uid() = any(matches.users)
  )
);

drop policy if exists "match senders delete own messages" on public.messages;
create policy "match senders delete own messages"
on public.messages for delete
to authenticated
using (sender_uid = auth.uid());

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
  inserted_id uuid;
  inserted_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if clean_text is null and coalesce(image_url_value, '') <> '' then
    clean_text := 'Imagem';
  end if;

  if clean_text is null then
    raise exception 'empty message';
  end if;

  if length(clean_text) > 1000 then
    raise exception 'message too long';
  end if;

  if not exists (
    select 1
    from public.matches
    where matches.id = target_match_id
      and auth.uid() = any(matches.users)
  ) then
    raise exception 'match not found or not allowed';
  end if;

  insert into public.messages (
    sender_uid,
    text,
    match_id,
    message_type,
    image_url,
    image_path,
    view_once,
    viewed_by,
    created_at
  )
  values (
    auth.uid(),
    clean_text,
    target_match_id,
    clean_type,
    coalesce(image_url_value, ''),
    coalesce(image_path_value, ''),
    coalesce(view_once_value, false),
    '{}',
    now()
  )
  returning messages.id, messages.created_at
  into inserted_id, inserted_created_at;

  update public.matches
  set last_message = clean_text,
      last_message_at = inserted_created_at
  where matches.id = target_match_id;

  return query select inserted_id, inserted_created_at;
end;
$$;

grant execute on function public.send_match_message(text, text, text, text, text, boolean) to authenticated;
