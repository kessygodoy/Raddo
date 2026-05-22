create table if not exists public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null,
  sender_uid uuid,
  recipient_count integer not null default 0,
  token_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.push_delivery_logs enable row level security;

drop policy if exists "authenticated users read push delivery logs" on public.push_delivery_logs;
create policy "authenticated users read push delivery logs"
  on public.push_delivery_logs
  for select
  to authenticated
  using (true);
