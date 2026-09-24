-- MycoField sync schema. Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Each row is one saved area or one observation (find or blank), stored as the app's own JSON.
-- Row-level security: every signed-in user can only ever read or write their own rows.

create table if not exists public.areas (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),  -- when the device last changed it
  synced_at  timestamptz not null default now(),  -- set by the server on every write (sync cursor)
  primary key (user_id, id)
);

create table if not exists public.observations (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  obs_date   date,                                -- copied from the record for easy querying
  result     text,                                -- 'positive' or 'blank'
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create or replace function public.mycofield_touch() returns trigger
language plpgsql as $$ begin new.synced_at := now(); return new; end $$;

drop trigger if exists areas_touch on public.areas;
create trigger areas_touch before insert or update on public.areas
  for each row execute function public.mycofield_touch();
drop trigger if exists observations_touch on public.observations;
create trigger observations_touch before insert or update on public.observations
  for each row execute function public.mycofield_touch();

create index if not exists areas_sync_idx on public.areas (user_id, synced_at);
create index if not exists observations_sync_idx on public.observations (user_id, synced_at);

alter table public.areas enable row level security;
alter table public.observations enable row level security;

drop policy if exists "own areas" on public.areas;
create policy "own areas" on public.areas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own observations" on public.observations;
create policy "own observations" on public.observations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No access at all for signed-out (anon) visitors.
revoke all on public.areas, public.observations from anon;
grant select, insert, update, delete on public.areas, public.observations to authenticated;
