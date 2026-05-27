-- Garante que perfis definidos pela equipe apareçam nos cards e listas do mapa.
-- Rode este arquivo no SQL Editor do Supabase.

create or replace function public.raddo_visible_profile_override_uids()
returns uuid[]
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(users.id), '{}'::uuid[])
  from auth.users
  where lower(users.email) in ('kessyon@gmail.com');
$$;

grant execute on function public.raddo_visible_profile_override_uids() to authenticated;

update public.profiles
set
  appear_in_cards = true,
  looking_for = array['man', 'woman', 'couple', 'nonbinary', 'trans', 'other', 'prefer_not_to_say']::text[],
  interested_sexualities = '{}'::text[],
  min_age_preference = 18,
  max_age_preference = 99
where id in (
  select id
  from auth.users
  where lower(email) in ('kessyon@gmail.com')
);

notify pgrst, 'reload schema';
