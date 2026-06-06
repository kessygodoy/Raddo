-- Retencao e privacidade.
-- Limpa cruzamentos antigos e evita guardar localizacao aproximada por tempo demais.

delete from public.profile_crossings
where last_crossed_at < now() - interval '30 days';

create or replace function public.cleanup_old_profile_crossings()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.profile_crossings
  where last_crossed_at < now() - interval '30 days';
$$;

grant execute on function public.cleanup_old_profile_crossings() to authenticated;

drop policy if exists "profile_crossings_select_own" on public.profile_crossings;
create policy "profile_crossings_select_own"
on public.profile_crossings for select
to authenticated
using (auth.uid() = user_uid);

drop policy if exists "profile_crossings_delete_own" on public.profile_crossings;
create policy "profile_crossings_delete_own"
on public.profile_crossings for delete
to authenticated
using (auth.uid() = user_uid);

notify pgrst, 'reload schema';
