
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
