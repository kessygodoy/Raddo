-- Cleanup fake Raddo test data.
-- Safe to run even if some tables do not exist yet.

do $$
begin
  if to_regclass('public.messages') is not null then
    execute $sql$
      delete from public.messages
      where match_id like '%00000000-0000-4000-8000-%'
         or sender_uid::text like '00000000-0000-4000-8000-%'
    $sql$;
  end if;

  if to_regclass('public.matches') is not null then
    execute $sql$
      delete from public.matches
      where id like '%00000000-0000-4000-8000-%'
         or exists (
           select 1
           from unnest(users) as uid
           where uid::text like '00000000-0000-4000-8000-%'
         )
    $sql$;
  end if;

  if to_regclass('public.likes') is not null then
    execute $sql$
      delete from public.likes
      where from_uid::text like '00000000-0000-4000-8000-%'
         or to_uid::text like '00000000-0000-4000-8000-%'
    $sql$;
  end if;

  if to_regclass('public.passes') is not null then
    execute $sql$
      delete from public.passes
      where from_uid::text like '00000000-0000-4000-8000-%'
         or to_uid::text like '00000000-0000-4000-8000-%'
    $sql$;
  end if;

  if to_regclass('public.map_event_messages') is not null then
    execute $sql$
      delete from public.map_event_messages
      where sender_uid::text like '00000000-0000-4000-8000-%'
    $sql$;
  end if;

  if to_regclass('public.map_event_messages') is not null
     and to_regclass('public.map_events') is not null then
    execute $sql$
      delete from public.map_event_messages
      where event_id in (
        select id from public.map_events
        where creator_uid::text like '00000000-0000-4000-8000-%'
      )
    $sql$;
  end if;

  if to_regclass('public.map_events') is not null then
    execute $sql$
      delete from public.map_events
      where creator_uid::text like '00000000-0000-4000-8000-%'
    $sql$;
  end if;

  if to_regclass('public.profiles') is not null then
    execute $sql$
      delete from public.profiles
      where id::text like '00000000-0000-4000-8000-%'
         or display_name like 'Teste Mulher %'
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.profiles') is not null
     and not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if to_regclass('public.likes') is not null
     and not exists (select 1 from pg_constraint where conname = 'likes_from_uid_fkey') then
    alter table public.likes
      add constraint likes_from_uid_fkey foreign key (from_uid) references auth.users(id) on delete cascade;
  end if;

  if to_regclass('public.likes') is not null
     and not exists (select 1 from pg_constraint where conname = 'likes_to_uid_fkey') then
    alter table public.likes
      add constraint likes_to_uid_fkey foreign key (to_uid) references auth.users(id) on delete cascade;
  end if;

  if to_regclass('public.messages') is not null
     and not exists (select 1 from pg_constraint where conname = 'messages_sender_uid_fkey') then
    alter table public.messages
      add constraint messages_sender_uid_fkey foreign key (sender_uid) references auth.users(id) on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
