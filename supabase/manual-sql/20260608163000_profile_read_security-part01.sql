-- Limit profile reads without breaking discovery, matches, and local chat participant lists.

drop policy if exists "profiles are readable by authenticated users" on public.profiles;

drop policy if exists "profiles readable by self visible cards and connections" on public.profiles;


create policy "profiles readable by self visible cards and connections"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or appear_in_cards = true
  or exists (
    select 1
    from public.matches
    where auth.uid() = any(matches.users)
      and profiles.id = any(matches.users)
  )
  or exists (
    select 1
    from public.map_event_participants viewer_participation
    join public.map_event_participants target_participation
      on target_participation.event_id = viewer_participation.event_id
    where viewer_participation.user_uid = auth.uid()
      and target_participation.user_uid = profiles.id
  )
  or public.is_app_moderator()
);


notify pgrst, 'reload schema';
