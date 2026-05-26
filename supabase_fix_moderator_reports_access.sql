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

grant select on public.reports to authenticated;
grant select on public.image_moderation_reports to authenticated;

notify pgrst, 'reload schema';
