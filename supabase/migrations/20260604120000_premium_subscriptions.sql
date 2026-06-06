alter table public.profiles
add column if not exists premium_until timestamptz;

create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  purchase_token text not null unique,
  package_name text not null,
  order_id text,
  subscription_state text not null,
  expires_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.premium_subscriptions enable row level security;

drop policy if exists "users read own premium subscriptions" on public.premium_subscriptions;
create policy "users read own premium subscriptions"
on public.premium_subscriptions for select
to authenticated
using (user_uid = auth.uid());

create index if not exists premium_subscriptions_user_uid_idx
on public.premium_subscriptions (user_uid);

create index if not exists premium_subscriptions_expires_at_idx
on public.premium_subscriptions (expires_at);
