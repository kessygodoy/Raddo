-- Production security hardening for Raddo.
-- This migration assumes the app uses RPCs for message writes/edits/deletes and view-once receipts.

alter table public.matches
  drop constraint if exists matches_users_pair_check;

alter table public.matches
  add constraint matches_users_pair_check
  check (cardinality(users) = 2 and users[1] <> users[2]);

alter table public.messages
  drop constraint if exists messages_message_type_check,
  drop constraint if exists messages_image_fields_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'image'));

alter table public.messages
  add constraint messages_image_fields_check
  check (
    (message_type = 'text' and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and image_url <> '' and length(image_url) <= 2048 and length(image_path) <= 512)
  );

alter table public.map_event_messages
  drop constraint if exists map_event_messages_message_type_check,
  drop constraint if exists map_event_messages_image_fields_check;

alter table public.map_event_messages
  add constraint map_event_messages_message_type_check
  check (message_type in ('text', 'image'));

alter table public.map_event_messages
  add constraint map_event_messages_image_fields_check
  check (
    (message_type = 'text' and image_url = '' and image_path = '' and view_once = false)
    or
    (message_type = 'image' and image_url <> '' and length(image_url) <= 2048 and length(image_path) <= 512)
  );

alter table public.map_events
  drop constraint if exists map_events_description_length_check,
  drop constraint if exists map_events_cover_url_length_check,
  drop constraint if exists map_events_password_hash_check,
  drop constraint if exists map_events_lat_lng_check;

alter table public.map_events
  add constraint map_events_description_length_check check (length(description) <= 280),
  add constraint map_events_cover_url_length_check check (length(cover_url) <= 2048),
  add constraint map_events_password_hash_check check (
    (access_mode <> 'password' and password_hash = '')
    or
    (access_mode = 'password' and length(password_hash) >= 12)
  ),
  add constraint map_events_lat_lng_check check (lat between -90 and 90 and lng between -180 and 180);

alter table public.reports
  drop constraint if exists reports_reason_length_check,
  drop constraint if exists reports_recent_messages_array_check;

alter table public.reports
  add constraint reports_reason_length_check check (length(reason) <= 160),
  add constraint reports_recent_messages_array_check check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 20);

alter table public.image_moderation_reports
  drop constraint if exists image_moderation_reports_status_check,
  drop constraint if exists image_moderation_reports_recent_messages_array_check;

alter table public.image_moderation_reports
  add constraint image_moderation_reports_status_check
  check (status in ('pending_human_review', 'rejected', 'approved', 'removed')),
  add constraint image_moderation_reports_recent_messages_array_check
  check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 20);

create or replace function public.user_can_manage_map_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and target_event_id is not null
    and (
      exists (
        select 1
        from public.map_events
        where id = target_event_id
          and creator_uid = auth.uid()
      )
      or exists (
        select 1
        from public.map_event_moderators
        where event_id = target_event_id
          and user_uid = auth.uid()
      )
    );
$$;

grant execute on function public.user_can_manage_map_event(uuid) to authenticated;

create table if not exists public.anti_spam_events (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid references auth.users(id) on delete cascade,
  context text not null default '',
  context_id text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.anti_spam_events enable row level security;

drop policy if exists "moderators read anti spam events" on public.anti_spam_events;
create policy "moderators read anti spam events"
on public.anti_spam_events for select
to authenticated
using (public.is_app_moderator());

grant select on public.anti_spam_events to authenticated;

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
  insert into public.anti_spam_events (user_uid, context, context_id, reason, created_at)
  values (
    target_user_uid,
    left(coalesce(target_context_type, ''), 80),
    coalesce(target_context_id::text, ''),
    left(coalesce(target_reason, ''), 120),
    now()
  );
end;
$$;

grant execute on function public.raddo_log_spam(uuid, text, uuid, text) to authenticated;

drop policy if exists "authenticated users read push delivery logs" on public.push_delivery_logs;
drop policy if exists "moderators read push delivery logs" on public.push_delivery_logs;
create policy "moderators read push delivery logs"
on public.push_delivery_logs for select
to authenticated
using (public.is_app_moderator());

drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
drop policy if exists "authenticated users remove event moderators" on public.map_event_moderators;
drop policy if exists "event owners manage event moderators" on public.map_event_moderators;
drop policy if exists "event owners add moderators" on public.map_event_moderators;
create policy "event owners add moderators"
on public.map_event_moderators for insert
to authenticated
with check (
  exists (
    select 1
    from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
      and map_event_moderators.user_uid <> auth.uid()
  )
);

drop policy if exists "event owners remove moderators" on public.map_event_moderators;
create policy "event owners remove moderators"
on public.map_event_moderators for delete
to authenticated
using (
  exists (
    select 1
    from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
  )
);

drop policy if exists "event bans are readable" on public.map_event_bans;
drop policy if exists "event bans readable by banned user or managers" on public.map_event_bans;
create policy "event bans readable by banned user or managers"
on public.map_event_bans for select
to authenticated
using (user_uid = auth.uid() or public.user_can_manage_map_event(event_id));

drop policy if exists "authenticated users manage event bans" on public.map_event_bans;
drop policy if exists "authenticated users create event bans" on public.map_event_bans;
drop policy if exists "authenticated users remove event bans" on public.map_event_bans;
drop policy if exists "event owners and moderators create bans" on public.map_event_bans;
create policy "event owners and moderators create bans"
on public.map_event_bans for insert
to authenticated
with check (
  banned_by_uid = auth.uid()
  and user_uid <> auth.uid()
  and public.user_can_manage_map_event(event_id)
);

drop policy if exists "event owners and moderators remove bans" on public.map_event_bans;
create policy "event owners and moderators remove bans"
on public.map_event_bans for delete
to authenticated
using (public.user_can_manage_map_event(event_id));

drop policy if exists "event join requests are readable" on public.map_event_join_requests;
drop policy if exists "event join requests readable by requester or managers" on public.map_event_join_requests;
create policy "event join requests readable by requester or managers"
on public.map_event_join_requests for select
to authenticated
using (user_uid = auth.uid() or public.user_can_manage_map_event(event_id));

drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
drop policy if exists "users create own join requests" on public.map_event_join_requests;
create policy "users create own join requests"
on public.map_event_join_requests for insert
to authenticated
with check (
  user_uid = auth.uid()
  and not exists (
    select 1
    from public.map_event_bans
    where map_event_bans.event_id = map_event_join_requests.event_id
      and map_event_bans.user_uid = auth.uid()
  )
);

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
  elsif clean_image_url = '' or length(clean_image_url) > 2048 or length(clean_image_path) > 512 then
    raise exception 'Midia invalida.';
  end if;

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
create policy "authenticated users read safe profile uploads"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    name !~ '/(chat-images|map-stories)/'
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.messages
      join public.matches on matches.id = messages.match_id
      where messages.image_path = storage.objects.name
        and auth.uid() = any(matches.users)
    )
    or exists (
      select 1
      from public.map_event_messages
      join public.map_event_participants on map_event_participants.event_id = map_event_messages.event_id
      where map_event_messages.image_path = storage.objects.name
        and map_event_participants.user_uid = auth.uid()
        and map_event_messages.created_at >= map_event_participants.joined_at
    )
    or exists (
      select 1
      from public.map_event_stories
      where map_event_stories.image_url like '%' || storage.objects.name || '%'
        and map_event_stories.expires_at > now()
        and (
          map_event_stories.creator_uid = auth.uid()
          or map_event_stories.event_id is null
          or exists (
            select 1
            from public.map_event_participants
            where map_event_participants.event_id = map_event_stories.event_id
              and map_event_participants.user_uid = auth.uid()
          )
          or exists (
            select 1
            from public.map_events
            where map_events.id = map_event_stories.event_id
              and map_events.access_mode = 'open'
          )
        )
    )
  )
);

drop policy if exists "users upload own profile photos" on storage.objects;
create policy "users upload own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov')
);

drop policy if exists "users update own profile photos" on storage.objects;
create policy "users update own profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov')
);

drop policy if exists "users delete own profile photos" on storage.objects;
create policy "users delete own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
