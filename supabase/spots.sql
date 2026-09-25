-- MycoField spot pack (£20 add-on). Paste into Supabase → SQL Editor → Run. Safe to run more than once.
--
-- How it stays protected:
--   * Nobody can read the spots table directly — not even paying users.
--   * A buyer gets their spots only through claim_spots(), which picks them ONCE from the
--     postcode/location they give, stores the ids on their pack, and from then on only ever
--     returns those same spots. Re-running it with another postcode returns the original set.
--   * Only the Stripe webhook (service role) can create a spot_packs row.
--
-- Add or edit spots in Table Editor → spots (or import a CSV there). Columns:
--   name, lat, lon, nation (England / Wales / Scotland), region, tier (1 = best, "big leagues";
--   2 = good; 3 = decent), access (e.g. "Open access land", "Common land", "Public footpath"),
--   notes (what to look for, where to park…), active (untick to retire a spot).

create table if not exists public.spots (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  lat        double precision not null check (lat between 49 and 61),
  lon        double precision not null check (lon between -9 and 2),
  nation     text check (nation in ('England', 'Wales', 'Scotland')),
  region     text,
  tier       smallint not null default 2 check (tier between 1 and 3),
  access     text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.spot_packs (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  place        text,
  lat          double precision,
  lon          double precision,
  spot_ids     uuid[],
  claimed_at   timestamptz
);

alter table public.spots enable row level security;
alter table public.spot_packs enable row level security;
revoke all on public.spots, public.spot_packs from anon, authenticated;

-- Buyers can see that they own a pack (and where it was picked from), nothing else.
drop policy if exists "read own spot pack" on public.spot_packs;
create policy "read own spot pack" on public.spot_packs for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.spot_packs to authenticated;

create or replace function public.km_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- p_count spots: first the best within p_near_km of the buyer (tier, then distance), then — if
-- that doesn't fill the pack — the best spots anywhere in Britain ("the big leagues").
create or replace function public.claim_spots(
  p_lat double precision default null, p_lon double precision default null, p_place text default null,
  p_count int default 10, p_near_km double precision default 60)
returns table (id uuid, name text, lat double precision, lon double precision, nation text, region text,
               tier smallint, access text, notes text, distance_km double precision, nearby boolean)
language plpgsql security definer set search_path = public as $$
declare
  pack public.spot_packs;
  near_ids uuid[];
  rest_ids uuid[];
begin
  select * into pack from public.spot_packs sp where sp.user_id = auth.uid();
  if not found then raise exception 'No spot pack on this account' using errcode = '42501'; end if;

  if pack.spot_ids is null then
    if p_lat is null or p_lon is null then return; end if;  -- not picked yet, and no location given
    p_count := least(greatest(p_count, 1), 20);
    near_ids := array(select s.id from public.spots s
      where s.active and public.km_between(p_lat, p_lon, s.lat, s.lon) <= p_near_km
      order by s.tier, public.km_between(p_lat, p_lon, s.lat, s.lon) limit p_count);
    rest_ids := array(select s.id from public.spots s
      where s.active and not (s.id = any(near_ids))
      order by s.tier, public.km_between(p_lat, p_lon, s.lat, s.lon) limit p_count - cardinality(near_ids));
    if cardinality(near_ids) + cardinality(rest_ids) = 0 then return; end if;  -- no spots loaded yet: don't lock an empty pack
    update public.spot_packs sp set spot_ids = near_ids || rest_ids, lat = p_lat, lon = p_lon,
      place = left(p_place, 120), claimed_at = now()
      where sp.user_id = auth.uid() returning * into pack;
  end if;

  return query
    select s.id, s.name, s.lat, s.lon, s.nation, s.region, s.tier, s.access, s.notes,
           round(public.km_between(pack.lat, pack.lon, s.lat, s.lon)::numeric, 1)::double precision,
           public.km_between(pack.lat, pack.lon, s.lat, s.lon) <= p_near_km
    from public.spots s where s.id = any(pack.spot_ids)
    order by 11 desc, s.tier, 10;
end $$;

revoke all on function public.claim_spots from public, anon;
grant execute on function public.claim_spots to authenticated;

-- Lets the app show the £20 offer only once there are spots to sell (reveals nothing else).
create or replace function public.spots_available()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.spots where active)
$$;
grant execute on function public.spots_available to anon, authenticated;
