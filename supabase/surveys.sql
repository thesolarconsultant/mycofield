-- MycoField ground-truth surveys: what people actually found on the ground at a spot, fed back into
-- the Conditions Index so a confirmed (or blank) visit nudges that location's future score.
-- Paste into Supabase → SQL Editor → Run. Safe to run again. Needs paywall.sql (for auth) and console.sql (is_admin).

-- One row per on-the-ground survey. spot_key is lat/lon to 2 dp — the same ~1 km cell the scanner uses,
-- so a survey lines up with the spot it describes without ever storing anyone's exact track.
create table if not exists public.spot_surveys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  spot_key    text not null,
  lat         double precision not null check (lat between 49 and 61),
  lon         double precision not null check (lon between -9 and 2),
  surveyed_on date not null default (now() at time zone 'Europe/London')::date,
  sward       text check (sward in ('short', 'medium', 'rank', 'unknown')),
  moss        boolean,
  grazing     text check (grazing in ('grazed', 'light', 'ungrazed', 'unknown')),
  found       boolean not null,
  species     smallint check (species between 0 and 50),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists spot_surveys_key on public.spot_surveys (spot_key, created_at desc);
create index if not exists spot_surveys_user on public.spot_surveys (user_id, created_at desc);
alter table public.spot_surveys enable row level security;
revoke all on public.spot_surveys from anon, authenticated;

-- Record a survey for the signed-in user. Returns the new row id. Capped at 40 a day per account.
create or replace function public.submit_survey(
  p_lat double precision, p_lon double precision, p_found boolean,
  p_sward text default null, p_moss boolean default null, p_grazing text default null,
  p_species int default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'sign_in_required' using errcode = '42501'; end if;
  if p_lat is null or p_lon is null or p_lat not between 49 and 61 or p_lon not between -9 and 2 then raise exception 'bad_point'; end if;
  if p_found is null then raise exception 'found_required'; end if;
  if p_sward is not null and p_sward not in ('short', 'medium', 'rank', 'unknown') then raise exception 'bad_sward'; end if;
  if p_grazing is not null and p_grazing not in ('grazed', 'light', 'ungrazed', 'unknown') then raise exception 'bad_grazing'; end if;
  if (select count(*) from public.spot_surveys s where s.user_id = uid and s.created_at > now() - interval '1 day') >= 40 then raise exception 'daily_limit'; end if;
  insert into public.spot_surveys (user_id, spot_key, lat, lon, sward, moss, grazing, found, species, notes)
  values (uid, round(p_lat::numeric, 2) || ',' || round(p_lon::numeric, 2), p_lat, p_lon,
          p_sward, p_moss, p_grazing, p_found, greatest(0, least(50, coalesce(p_species, 0))), left(nullif(trim(p_notes), ''), 500))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_survey(double precision, double precision, boolean, text, boolean, text, int, text) from public, anon;
grant execute on function public.submit_survey(double precision, double precision, boolean, text, boolean, text, int, text) to authenticated;

-- The caller's own surveys, newest first.
create or replace function public.my_surveys() returns setof public.spot_surveys language sql stable security definer set search_path = public as $$
  select * from public.spot_surveys where user_id = auth.uid() order by created_at desc limit 200
$$;
revoke all on function public.my_surveys() from public, anon;
grant execute on function public.my_surveys() to authenticated;

-- The ground-truth adjustment per ~1 km cell: a capped (-15..+15) nudge the app and scanner add to the
-- Conditions Index. A confirmed find (especially short, mossy, species-rich turf) pushes a cell up; a
-- blank visit pushes it down. Recent surveys count for more (one-year half-life); nothing older than 3 years.
-- Returns only the cell key and the number — no coordinates finer than the public heatmap, no who or when.
create or replace function public.ground_truth() returns table (k text, adj int) language sql stable security definer set search_path = public as $$
  select s.spot_key as k, greatest(-15, least(15, round(sum(s.contrib * s.weight))::int)) as adj
  from (
    select spot_key,
      case when found
        then 4 + least(coalesce(species, 0), 6) * 2
             + (case sward when 'short' then 4 when 'medium' then 1 when 'rank' then -4 else 0 end)
             + (case when moss is true then 3 when moss is false then -2 else 0 end)
        else -6 end as contrib,
      exp(-extract(epoch from (now() - created_at)) / 86400 / 365.0) as weight
    from public.spot_surveys
    where created_at > now() - interval '3 years'
  ) s
  group by s.spot_key
  having greatest(-15, least(15, round(sum(s.contrib * s.weight))::int)) <> 0
$$;
revoke all on function public.ground_truth() from public;
grant execute on function public.ground_truth() to anon, authenticated;

-- Owner view for the console: every survey, newest first.
create or replace function public.admin_surveys(p_limit int default 200) returns setof public.spot_surveys language plpgsql stable security definer set search_path = public as $$
begin if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select * from public.spot_surveys order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;
revoke all on function public.admin_surveys(int) from public, anon;
grant execute on function public.admin_surveys(int) to authenticated;

select 'surveys ready' as status;
