-- Seguranca Raddo - parte 1/2.
-- Rode primeiro no SQL Editor do Supabase.

create or replace function public.user_can_manage_map_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
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

drop policy if exists "authenticated users create map events" on public.map_events;
drop policy if exists "event creators create own map events" on public.map_events;
create policy "event creators create own map events"
on public.map_events for insert
to authenticated
with check (auth.uid() = creator_uid);

drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
drop policy if exists "authenticated users remove event moderators" on public.map_event_moderators;
drop policy if exists "event owners manage event moderators" on public.map_event_moderators;
drop policy if exists "event owners add moderators" on public.map_event_moderators;
create policy "event owners add moderators"
on public.map_event_moderators for insert
to authenticated
with check (
  exists (
    select 1 from public.map_events
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
    select 1 from public.map_events
    where map_events.id = map_event_moderators.event_id
      and map_events.creator_uid = auth.uid()
  )
);

drop policy if exists "event bans are readable" on public.map_event_bans;
drop policy if exists "event bans readable by banned user or managers" on public.map_event_bans;
create policy "event bans readable by banned user or managers"
on public.map_event_bans for select
to authenticated
using (
  user_uid = auth.uid()
  or public.user_can_manage_map_event(event_id)
);

drop policy if exists "authenticated users manage event bans" on public.map_event_bans;
drop policy if exists "authenticated users create event bans" on public.map_event_bans;
drop policy if exists "authenticated users remove event bans" on public.map_event_bans;
drop policy if exists "event owners and moderators manage event bans" on public.map_event_bans;
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
