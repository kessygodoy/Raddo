create or replace function public.public_text_is_allowed(input_text text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := translate(
    lower(coalesce(input_text, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
  normalized := replace(normalized, '@', 'a');
  normalized := replace(normalized, '4', 'a');
  normalized := replace(normalized, '3', 'e');
  normalized := replace(normalized, '1', 'i');
  normalized := replace(normalized, '0', 'o');
  normalized := replace(normalized, '$', 's');
  normalized := replace(normalized, '5', 's');
  normalized := replace(normalized, '7', 't');
  normalized := trim(regexp_replace(normalized, '[^a-z0-9]+', ' ', 'g'));

  return normalized !~ '(^| )(caralh[a-z0-9]*|porr[a-z0-9]*|merd[a-z0-9]*|put[ao][a-z0-9]*|fod[a-z0-9]*|bost[a-z0-9]*|cacete[a-z0-9]*|bucet[a-z0-9]*|bocet[a-z0-9]*|xerec[a-z0-9]*|xana|xano|piroc[a-z0-9]*|piroq[a-z0-9]*|rola|rolao|penis|vagin[a-z0-9]*|sexo|sexual[a-z0-9]*|sexy|transa[a-z0-9]*|trepa[a-z0-9]*|boquete[a-z0-9]*|nude|nudes|pelado|pelada|pelados|peladas|porn[a-z0-9]*|tesao|orgasm[a-z0-9]*|goza[a-z0-9]*|masturb[a-z0-9]*|punhet[a-z0-9]*|siriric[a-z0-9]*|surub[a-z0-9]*|fuck[a-z0-9]*|shit[a-z0-9]*|bitch[a-z0-9]*|dick[a-z0-9]*|cock[a-z0-9]*|pussy|blowjob[a-z0-9]*|naked|horny|mierd[a-z0-9]*|cono|chinga[a-z0-9]*|pendej[a-z0-9]*)( |$)';
end;
$$;

create or replace function public.enforce_allowed_public_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'profiles' then
    if not public.public_text_is_allowed(new.display_name) or not public.public_text_is_allowed(new.bio) then
      raise exception using
        errcode = '23514',
        message = 'Texto público bloqueado: reformule palavras de baixo calão ou conteúdo sexual.';
    end if;
  elsif tg_table_name = 'map_events' then
    if not public.public_text_is_allowed(new.title) or not public.public_text_is_allowed(new.description) then
      raise exception using
        errcode = '23514',
        message = 'Texto público bloqueado: reformule palavras de baixo calão ou conteúdo sexual.';
    end if;
  elsif tg_table_name = 'map_event_stories' then
    if not public.public_text_is_allowed(new.text) then
      raise exception using
        errcode = '23514',
        message = 'Texto público bloqueado: reformule palavras de baixo calão ou conteúdo sexual.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_allowed_public_text on public.profiles;
create trigger profiles_allowed_public_text
before insert or update of display_name, bio on public.profiles
for each row execute function public.enforce_allowed_public_text();

drop trigger if exists map_events_allowed_public_text on public.map_events;
create trigger map_events_allowed_public_text
before insert or update of title, description on public.map_events
for each row execute function public.enforce_allowed_public_text();

drop trigger if exists map_event_stories_allowed_public_text on public.map_event_stories;
create trigger map_event_stories_allowed_public_text
before insert or update of text on public.map_event_stories
for each row execute function public.enforce_allowed_public_text();
