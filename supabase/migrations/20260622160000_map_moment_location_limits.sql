create or replace function public.enforce_map_moment_location_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_location_count integer;
  location_limit integer;
  premium_user boolean;
begin
  if new.location_lat is null or new.location_lng is null then
    raise exception using
      errcode = '23514',
      message = 'Escolha um local para publicar o Momento.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.creator_uid::text, 0));

  if exists (
    select 1
    from public.map_event_stories story
    where story.creator_uid = new.creator_uid
      and story.expires_at > now()
      and story.location_lat is not null
      and story.location_lng is not null
      and abs(story.location_lat - new.location_lat) <= 0.0003
      and abs(story.location_lng - new.location_lng) <= 0.0003
  ) then
    return new;
  end if;

  select coalesce(profile.is_premium, false)
  into premium_user
  from public.profiles profile
  where profile.id = new.creator_uid;

  location_limit := case when coalesce(premium_user, false) then 10 else 1 end;

  select count(*)
  into active_location_count
  from (
    select distinct round(story.location_lat::numeric, 4), round(story.location_lng::numeric, 4)
    from public.map_event_stories story
    where story.creator_uid = new.creator_uid
      and story.expires_at > now()
      and story.location_lat is not null
      and story.location_lng is not null
  ) active_locations;

  if active_location_count >= location_limit then
    raise exception using
      errcode = '23514',
      message = case
        when premium_user then 'Limite de 10 locais ativos para Momentos. Publique em um local já usado.'
        else 'Limite de 1 local ativo para Momentos. Use Criar outro neste local.'
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists map_event_stories_location_limit on public.map_event_stories;
create trigger map_event_stories_location_limit
before insert on public.map_event_stories
for each row execute function public.enforce_map_moment_location_limit();
