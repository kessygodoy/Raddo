-- Authenticated users can send improvement suggestions and bug reports.

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  message text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  constraint app_feedback_kind_check check (kind in ('suggestion', 'bug')),
  constraint app_feedback_message_check check (length(trim(message)) between 10 and 3000),
  constraint app_feedback_user_agent_check check (length(user_agent) <= 512)
);

alter table public.app_feedback enable row level security;

drop policy if exists "users send own app feedback" on public.app_feedback;
create policy "users send own app feedback"
on public.app_feedback for insert
to authenticated
with check (user_uid = auth.uid());

grant insert on public.app_feedback to authenticated;

create index if not exists app_feedback_created_at_idx
on public.app_feedback (created_at desc);
