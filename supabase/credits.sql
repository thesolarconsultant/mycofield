-- MycoField spot credits. Paste into Supabase → SQL Editor → Run. Safe to run more than once.
--
-- How it works:
--   * £20 buys 10 credits, valid 12 months (the Stripe webhook adds a credit lot).
--   * Every night the scanner loads that day's live spots: score 90+, confirmed grassland / heath /
--     bog, on land the public can walk (open-access land, registered common, or Scotland's access rights).
--   * One credit reveals the best available spot in the nation the buyer picks. A spot is revealed to
--     at most 5 buyers in any 7 days, and never twice to the same buyer.
--   * Nobody reads these tables directly: everything goes through the functions below.

create table if not exists public.credit_lots (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  qty          int  not null check (qty > 0),
  remaining    int  not null check (remaining >= 0),
  purchased_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  payment_id   text unique            -- Stripe checkout session (or a note for manual grants)
);
create index if not exists credit_lots_user on public.credit_lots (user_id, expires_at);

create table if not exists public.live_spots (
  id         bigint generated always as identity primary key,
  scanned_on date   not null,
  spot_key   text   not null,         -- lat/lon to 2 dp: the same hillside keeps the same key day to day
  nation     text   not null check (nation in ('England', 'Wales', 'Scotland', 'Northern Ireland')),
  name       text   not null,
  region     text,
  lat        double precision not null check (lat between 49 and 61),
  lon        double precision not null check (lon between -9 and 2),
  score      smallint not null check (score between 0 and 100),
  habitat    text,
  access     text   not null,
  grazing    text,
  rain14     real,
  low        real,
  elev       real,
  unique (scanned_on, spot_key)
);
create index if not exists live_spots_pick on public.live_spots (scanned_on, nation, score desc);

create table if not exists public.spot_reveals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  lot_id      bigint references public.credit_lots (id) on delete set null,
  spot_key    text not null,
  scanned_on  date,
  nation      text, name text, region text,
  lat         double precision, lon double precision,
  score       smallint, habitat text, access text, grazing text,
  rain14      real, low real, elev real,
  revealed_at timestamptz not null default now()
);
create unique index if not exists spot_reveals_once on public.spot_reveals (user_id, spot_key);
create index if not exists spot_reveals_cap on public.spot_reveals (spot_key, revealed_at);

-- The nightly scanner proves itself with a token; only its SHA-256 is stored.
create table if not exists public.scanner_tokens (
  token_hash text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.mycofield_migrations (name text primary key, ran_at timestamptz not null default now());

alter table public.credit_lots    enable row level security;
alter table public.live_spots     enable row level security;
alter table public.spot_reveals   enable row level security;
alter table public.scanner_tokens enable row level security;
alter table public.mycofield_migrations enable row level security;
revoke all on public.credit_lots, public.live_spots, public.spot_reveals, public.scanner_tokens, public.mycofield_migrations from anon, authenticated;

-- The scan buyers draw from: the newest one, and only if it is at most 2 days old (a stalled
-- scanner never sells stale spots).
create or replace function public.current_scan() returns date
language sql stable security definer set search_path = public as $$
  select max(scanned_on) from public.live_spots where scanned_on >= current_date - 2
$$;
revoke all on function public.current_scan() from public, anon, authenticated;

-- How many spots each nation has right now for this buyer (cap and their own reveals applied).
-- Safe for anyone: counts and best score only, never a location.
create or replace function public.spot_counts()
returns table (nation text, available int, best smallint)
language sql stable security definer set search_path = public as $$
  with n(nation, ord) as (values ('England', 1), ('Wales', 2), ('Scotland', 3), ('Northern Ireland', 4)),
  s as (
    select l.nation, l.score from public.live_spots l
    where l.scanned_on = public.current_scan()
      and (select count(*) from public.spot_reveals r where r.spot_key = l.spot_key and r.revealed_at > now() - interval '7 days') < 5
      and not exists (select 1 from public.spot_reveals r where r.spot_key = l.spot_key and r.user_id = auth.uid())
  )
  select n.nation, count(s.score)::int, max(s.score)::smallint
  from n left join s on s.nation = n.nation group by n.nation, n.ord order by n.ord
$$;
grant execute on function public.spot_counts() to anon, authenticated;

-- Balance and soonest expiry of the caller's unexpired credits.
create or replace function public.my_credits()
returns table (balance int, next_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int, min(expires_at) filter (where remaining > 0)
  from public.credit_lots where user_id = auth.uid() and expires_at > now()
$$;
revoke all on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;

-- Every spot the caller has revealed, newest first.
create or replace function public.my_spots()
returns setof public.spot_reveals
language sql stable security definer set search_path = public as $$
  select * from public.spot_reveals where user_id = auth.uid() order by revealed_at desc
$$;
revoke all on function public.my_spots() from public, anon;
grant execute on function public.my_spots() to authenticated;

-- Spend one credit on the best available spot in a nation. All or nothing: if there is no spot,
-- no credit is taken. Serialised so two buyers can never both take a spot's 5th slot.
create or replace function public.reveal_spot(p_nation text)
returns setof public.spot_reveals
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lot public.credit_lots;
  spot public.live_spots;
  scan date := public.current_scan();
begin
  if uid is null then raise exception 'sign_in_required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('mycofield_reveal'));
  select * into lot from public.credit_lots
    where user_id = uid and remaining > 0 and expires_at > now()
    order by expires_at limit 1 for update;
  if not found then raise exception 'no_credits' using errcode = 'P0001'; end if;
  select * into spot from public.live_spots l
    where l.scanned_on = scan and l.nation = p_nation
      and not exists (select 1 from public.spot_reveals r where r.user_id = uid and r.spot_key = l.spot_key)
      and (select count(*) from public.spot_reveals r where r.spot_key = l.spot_key and r.revealed_at > now() - interval '7 days') < 5
    order by l.score desc, random() limit 1;
  if not found then raise exception 'none_available' using errcode = 'P0001'; end if;
  update public.credit_lots set remaining = remaining - 1 where id = lot.id;
  return query insert into public.spot_reveals
      (user_id, lot_id, spot_key, scanned_on, nation, name, region, lat, lon, score, habitat, access, grazing, rain14, low, elev)
    values (uid, lot.id, spot.spot_key, spot.scanned_on, spot.nation, spot.name, spot.region, spot.lat, spot.lon,
            spot.score, spot.habitat, spot.access, spot.grazing, spot.rain14, spot.low, spot.elev)
    returning *;
end $$;
revoke all on function public.reveal_spot(text) from public, anon;
grant execute on function public.reveal_spot(text) to authenticated;

-- The nightly scanner replaces one day's list. Needs a token made with scanner-token.sql.
create or replace function public.load_live_spots(p_token text, p_scanned_on date, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_token is null or not exists (select 1 from public.scanner_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
    then raise exception 'bad_token' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'bad_rows'; end if;
  delete from public.live_spots where scanned_on = p_scanned_on;
  insert into public.live_spots (scanned_on, spot_key, nation, name, region, lat, lon, score, habitat, access, grazing, rain14, low, elev)
    select p_scanned_on, r.spot_key, r.nation, left(r.name, 120), left(r.region, 120), r.lat, r.lon, r.score, left(r.habitat, 60),
           left(r.access, 120), left(r.grazing, 60), r.rain14, r.low, r.elev
    from jsonb_to_recordset(p_rows) as r(spot_key text, nation text, name text, region text, lat double precision, lon double precision,
         score smallint, habitat text, access text, grazing text, rain14 real, low real, elev real)
    where r.score >= 90
    on conflict (scanned_on, spot_key) do nothing;
  get diagnostics n = row_count;
  delete from public.live_spots where scanned_on < current_date - 30;
  return n;
end $$;
revoke all on function public.load_live_spots(text, date, jsonb) from public;
grant execute on function public.load_live_spots(text, date, jsonb) to anon;

-- One-off changes, each applied once however often this file is run.
do $$ begin
  -- Anyone who bought the old £20 spot pack gets 10 credits instead.
  if to_regclass('public.spot_packs') is not null and not exists (select 1 from public.mycofield_migrations where name = 'legacy_spot_packs') then
    insert into public.credit_lots (user_id, qty, remaining, expires_at, payment_id)
      select user_id, 10, 10, now() + interval '12 months', 'legacy_pack_' || user_id from public.spot_packs
      on conflict (payment_id) do nothing;
    insert into public.mycofield_migrations (name) values ('legacy_spot_packs');
  end if;
  -- £8 now buys a year, not 90 days: everyone with access gets the extra 275 days.
  if to_regclass('public.entitlements') is not null and not exists (select 1 from public.mycofield_migrations where name = 'access_one_year') then
    update public.entitlements set paid_until = paid_until + interval '275 days', updated_at = now() where paid_until > now();
    insert into public.mycofield_migrations (name) values ('access_one_year');
  end if;
end $$;

select 'credits ready' as status;
