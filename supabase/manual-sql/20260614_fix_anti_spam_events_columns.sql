alter table public.anti_spam_events
  add column if not exists context text not null default '';

alter table public.anti_spam_events
  add column if not exists context_id text;

drop index if exists public.anti_spam_events_context_idx;

alter table public.anti_spam_events
  alter column context_id drop default,
  alter column context_id type text using coalesce(context_id::text, ''),
  alter column context_id set default '';

update public.anti_spam_events
set context_id = ''
where context_id is null;

alter table public.anti_spam_events
  alter column context_id set not null;

create index if not exists anti_spam_events_context_idx
  on public.anti_spam_events (context, context_id);
