-- Storage privado definitivo - parte 2/2.

drop policy if exists "users delete own profile photos" on storage.objects;
create policy "users delete own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "moderators read image moderation reports" on public.image_moderation_reports;
create policy "moderators read image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (public.is_app_moderator());

drop policy if exists "moderators read reports" on public.reports;
create policy "moderators read reports"
on public.reports for select
to authenticated
using (public.is_app_moderator());

notify pgrst, 'reload schema';
