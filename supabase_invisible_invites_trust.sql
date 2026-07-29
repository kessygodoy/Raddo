-- Raddo: convites invisiveis + sinais de confianca
-- Rode este arquivo no SQL Editor do Supabase antes de publicar o app com a nova feature.

alter table public.map_events
  add column if not exists discovery_mode text not null default 'public';

alter table public.map_events
  add column if not exists affinity_interests text[] not null default '{}';

alter table public.map_events
  add column if not exists affinity_goals text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'map_events_discovery_mode_check'
  ) then
    alter table public.map_events
      add constraint map_events_discovery_mode_check check (discovery_mode in ('public', 'invisible'));
  end if;
end $$;

create index if not exists map_events_discovery_mode_idx
  on public.map_events (discovery_mode);

create index if not exists map_events_affinity_interests_idx
  on public.map_events using gin (affinity_interests);

create index if not exists map_events_affinity_goals_idx
  on public.map_events using gin (affinity_goals);

drop policy if exists "authenticated users read map events" on public.map_events;
create policy "authenticated users read map events"
on public.map_events for select
to authenticated
using (
  discovery_mode = 'public'
  or creator_uid = auth.uid()
  or exists (
    select 1 from public.map_event_participants
    where map_event_participants.event_id = map_events.id
      and map_event_participants.user_uid = auth.uid()
  )
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and (
        coalesce(profiles.interests, '{}') && map_events.affinity_interests
        or coalesce(profiles.relationship_goals, '{}') && map_events.affinity_goals
      )
  )
);
