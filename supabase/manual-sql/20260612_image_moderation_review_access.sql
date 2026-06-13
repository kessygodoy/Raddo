drop policy if exists "moderators read image moderation reports" on public.image_moderation_reports;
create policy "moderators read image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (public.is_app_moderator());

drop policy if exists "moderators read moderated profile uploads" on storage.objects;
create policy "moderators read moderated profile uploads"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and public.is_app_moderator()
);
