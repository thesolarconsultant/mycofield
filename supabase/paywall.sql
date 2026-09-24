-- MycoField paid access. Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Only the Stripe webhook (running with the service role) can grant access; users can only read
-- their own expiry date.

create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  paid_until timestamptz not null,
  updated_at timestamptz not null default now()
);

-- One row per Stripe Checkout session, so a repeated webhook can never double-credit.
create table if not exists public.payments (
  id         text primary key,
  user_id    uuid references auth.users (id) on delete set null,
  email      text,
  amount     integer,
  currency   text,
  created_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
alter table public.payments enable row level security;

drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.entitlements, public.payments from anon, authenticated;
grant select on public.entitlements to authenticated;
