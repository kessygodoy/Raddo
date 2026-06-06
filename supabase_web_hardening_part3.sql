-- Web hardening 3/3: storage privado e relatorios.

update storage.buckets
set public = false
where id = 'profile-photos';

drop policy if exists "profile photos are public" on storage.objects;
drop policy if exists "public read profile photos" on storage.objects;
drop policy if exists "anyone can read profile photos" on storage.objects;

drop policy if exists "authenticated users read profile photos" on storage.objects;
create policy "authenticated users read profile photos"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-photos');

drop policy if exists "moderators read reports" on public.reports;
create policy "moderators read reports"
on public.reports for select
to authenticated
using (public.is_app_moderator());

drop policy if exists "moderators read image moderation reports" on public.image_moderation_reports;
create policy "moderators read image moderation reports"
on public.image_moderation_reports for select
to authenticated
using (public.is_app_moderator());

notify pgrst, 'reload schema';
