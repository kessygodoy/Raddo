alter table public.profiles add column if not exists age integer not null default 18;

alter table public.profiles drop constraint if exists profiles_age_check;
alter table public.profiles add constraint profiles_age_check check (age between 18 and 99);
