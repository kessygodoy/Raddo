create table if not exists public.profile_crossings (
  user_uid uuid not null references public.profiles(id) on delete cascade,
  crossed_uid uuid not null references public.profiles(id) on delete cascade,
  crossed_at timestamptz not null default now(),
  last_crossed_at timestamptz not null default now(),
  distance_meters integer not null default 250,
  primary key (user_uid, crossed_uid),
  constraint profile_crossings_not_self check (user_uid <> crossed_uid)
);

alter table public.profile_crossings enable row level security;

drop policy if exists "profile_crossings_select_own" on public.profile_crossings;
create policy "profile_crossings_select_own"
on public.profile_crossings
for select
using (auth.uid() = user_uid);

drop policy if exists "profile_crossings_insert_own" on public.profile_crossings;
create policy "profile_crossings_insert_own"
on public.profile_crossings
for insert
with check (auth.uid() = user_uid);

drop policy if exists "profile_crossings_update_own" on public.profile_crossings;
create policy "profile_crossings_update_own"
on public.profile_crossings
for update
using (auth.uid() = user_uid)
with check (auth.uid() = user_uid);

drop policy if exists "profile_crossings_delete_own" on public.profile_crossings;
create policy "profile_crossings_delete_own"
on public.profile_crossings
for delete
using (auth.uid() = user_uid);

create index if not exists profile_crossings_user_recent_idx
on public.profile_crossings (user_uid, last_crossed_at desc);

create index if not exists profile_crossings_crossed_uid_idx
on public.profile_crossings (crossed_uid);
