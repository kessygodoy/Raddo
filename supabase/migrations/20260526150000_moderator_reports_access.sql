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
