alter table public.reports
  drop constraint if exists reports_recent_messages_array_check;

alter table public.reports
  add constraint reports_recent_messages_array_check
  check (jsonb_typeof(recent_messages) = 'array' and jsonb_array_length(recent_messages) <= 30);
