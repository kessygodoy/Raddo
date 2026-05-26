alter table public.profiles add column if not exists gender_identities text[] not null default '{}';
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists relationship_goals text[] not null default '{}';

update public.profiles
set gender_identities = array[gender]
where gender_identities = '{}';

