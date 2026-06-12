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
