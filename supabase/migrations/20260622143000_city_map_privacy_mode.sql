alter table public.profiles
  drop constraint if exists profiles_privacy_mode_check;

alter table public.profiles
  add constraint profiles_privacy_mode_check
  check (privacy_mode in ('exact', 'city', 'nearby'));
