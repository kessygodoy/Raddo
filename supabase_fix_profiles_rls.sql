-- Fix profile creation after Supabase magic-link login.
-- Run this in Supabase SQL Editor.

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;

create policy "profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_uid uuid := auth.uid();
  viewer_email text;
  created_profile public.profiles;
begin
  if viewer_uid is null then
    raise exception 'not authenticated';
  end if;

  select email into viewer_email
  from auth.users
  where id = viewer_uid;

  insert into public.profiles (
    id,
    display_name,
    photo_url,
    photos,
    privacy_mode,
    visibility_radius,
    gender,
    sexualities,
    looking_for,
    interested_sexualities,
    bio,
    is_premium,
    likes_used_today,
    likes_quota_date,
    likes_bonus,
    liked_by_unlock_until,
    last_seen
  )
  values (
    viewer_uid,
    coalesce(split_part(viewer_email, '@', 1), 'Novo radar'),
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=700&q=80',
    array['https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=700&q=80'],
    'nearby',
    5,
    'man',
    '{}',
    array['man', 'woman', 'couple'],
    '{}',
    '',
    false,
    0,
    current_date,
    0,
    null,
    now()
  )
  on conflict (id) do update
    set last_seen = excluded.last_seen
  returning * into created_profile;

  return created_profile;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

notify pgrst, 'reload schema';
