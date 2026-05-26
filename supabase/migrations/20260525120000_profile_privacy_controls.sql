alter table public.profiles add column if not exists appear_in_cards boolean not null default true;
alter table public.profiles add column if not exists show_distance boolean not null default true;
alter table public.profiles add column if not exists show_online_status boolean not null default true;

