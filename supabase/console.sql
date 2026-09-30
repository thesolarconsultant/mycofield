-- MycoField console: visit tracking, owner-only numbers, and the content queue. Paste all of it into
-- Supabase → SQL Editor → Run. Safe to run again. Needs paywall.sql, credits.sql, ask.sql, lead-spots.sql.

-- Who can open www.mycofield.com/console (signed in with one of these emails).
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
insert into public.admins (email) values ('help@mycofield.com'), ('support@thesolarconsultant.uk'), ('jordanbrown-93@outlook.com'), ('j0rd4nbr0wn93@gmail.com') on conflict do nothing;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.admins a join auth.users u on lower(u.email) = a.email where u.id = auth.uid()) $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Visits: no cookies, no IP. The app sends a random id per visit (sessionStorage) and a few named steps.
create table if not exists public.events (id bigint generated always as identity primary key, at timestamptz not null default now(), name text not null, sid text not null, uid uuid, props jsonb not null default '{}');
create index if not exists events_at on public.events (at);
create index if not exists events_sid on public.events (sid, at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
create or replace function public.track(p_name text, p_sid text, p_props jsonb default '{}') returns void language plpgsql security definer set search_path = public as $$ begin if p_name !~ '^[a-z_]{2,32}$' or p_sid !~ '^[a-z0-9]{8,40}$' then return; end if; if p_props is null or jsonb_typeof(p_props) <> 'object' or pg_column_size(p_props) > 2000 then p_props := '{}'; end if; if (select count(*) from public.events e where e.sid = p_sid and e.at > now() - interval '1 day') >= 300 then return; end if; if (select count(*) from public.events e where e.at > now() - interval '1 minute') >= 1200 then return; end if; insert into public.events (name, sid, uid, props) values (p_name, p_sid, auth.uid(), p_props); end $$;
revoke all on function public.track(text, text, jsonb) from public;
grant execute on function public.track(text, text, jsonb) to anon, authenticated;

-- Everything the console's Overview shows, for the last p_days days (UK dates).
create or replace function public.admin_stats(p_days int default 14) returns jsonb language plpgsql stable security definer set search_path = public as $$ declare d int := least(greatest(coalesce(p_days, 14), 1), 180); since timestamptz := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London' - make_interval(days => d - 1); r jsonb; begin if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
select jsonb_build_object(
 'days', (select coalesce(jsonb_agg(x order by x.day), '[]') from (select g::date as day,
    (select count(distinct e.sid) from public.events e where e.name = 'open' and (e.at at time zone 'Europe/London')::date = g::date) as visitors,
    (select count(*) from auth.users u where (u.created_at at time zone 'Europe/London')::date = g::date) as signups,
    (select count(*) from public.payments p where (p.created_at at time zone 'Europe/London')::date = g::date) as payments,
    (select count(*) from public.lead_spots l where (l.created_at at time zone 'Europe/London')::date = g::date) as leads
  from generate_series((now() at time zone 'Europe/London')::date - (d - 1), (now() at time zone 'Europe/London')::date, interval '1 day') g) x),
 'funnel', (select coalesce(jsonb_agg(jsonb_build_object('step', s.step, 'n', (select count(distinct e.sid) from public.events e where e.name = s.step and e.at >= since)) order by s.i), '[]') from unnest(array['open','spot_open','paywall','signin_sent','signed_in','pay_click','paid']) with ordinality s(step, i)),
 'sources', (select coalesce(jsonb_agg(jsonb_build_object('src', t.src, 'n', t.n) order by t.n desc), '[]') from (select coalesce(nullif(e.props->>'src', ''), 'direct') as src, count(distinct e.sid) as n from public.events e where e.name = 'open' and e.at >= since group by 1 order by 2 desc limit 12) t),
 'devices', (select coalesce(jsonb_object_agg(t.dev, t.n), '{}') from (select coalesce(e.props->>'dev', '?') as dev, count(distinct e.sid) as n from public.events e where e.name = 'open' and e.at >= since group by 1) t),
 'actions', (select coalesce(jsonb_object_agg(t.name, t.n), '{}') from (select e.name, count(*) as n from public.events e where e.at >= since group by 1) t),
 'totals', jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'with_access', (select count(*) from public.entitlements where paid_until > now()),
    'payments', (select count(*) from public.payments),
    'revenue_p', (select coalesce(sum(amount), 0) from public.payments),
    'questions', (select coalesce(sum(n), 0) from public.ask_usage where day >= (now() at time zone 'Europe/London')::date - (d - 1)),
    'leads', (select count(*) from public.lead_spots),
    'live_now', (select count(distinct sid) from public.events where at > now() - interval '5 minutes'),
    'visitors', (select count(distinct sid) from public.events where name = 'open' and at >= since)),
 'people', (select coalesce(jsonb_agg(p order by p.created_at desc), '[]') from (select u.email, u.created_at, u.last_sign_in_at, en.paid_until, (select count(*) from public.payments pa where pa.user_id = u.id) as paid from auth.users u left join public.entitlements en on en.user_id = u.id order by u.created_at desc limit 40) p),
 'recent', (select coalesce(jsonb_agg(t order by t.at desc), '[]') from (select e.at, e.name, left(e.sid, 6) as sid, e.props from public.events e order by e.at desc limit 40) t)
) into r; return r; end $$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;

-- Content queue: the daily engine adds drafts; you approve in the console; the publish function posts them.
create table if not exists public.content_posts (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), for_date date not null default (now() at time zone 'Europe/London')::date, kind text not null check (kind in ('video', 'image', 'carousel')), media jsonb not null default '[]', title text, caption text not null default '', platforms text[] not null default '{tiktok,instagram,facebook}', ai boolean not null default true, status text not null default 'draft' check (status in ('draft', 'approved', 'posting', 'posted', 'failed', 'rejected')), brief jsonb, request_id text, results jsonb, error text, approved_at timestamptz, posted_at timestamptz);
create index if not exists content_posts_date on public.content_posts (for_date desc, created_at desc);
alter table public.content_posts enable row level security;
revoke all on public.content_posts from anon, authenticated;
create table if not exists public.content_settings (key text primary key, value jsonb not null);
alter table public.content_settings enable row level security;
revoke all on public.content_settings from anon, authenticated;
insert into public.content_settings (key, value) values ('autopilot', '{"paused": false}') on conflict do nothing;
create table if not exists public.content_tokens (token_hash text primary key, created_at timestamptz not null default now());
alter table public.content_tokens enable row level security;
revoke all on public.content_tokens from anon, authenticated;

create or replace function public.admin_content(p_limit int default 60) returns setof public.content_posts language plpgsql stable security definer set search_path = public as $$ begin if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if; return query select * from public.content_posts order by for_date desc, created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200); end $$;
revoke all on function public.admin_content(int) from public, anon;
grant execute on function public.admin_content(int) to authenticated;
-- Edit a caption, pick platforms, approve or reject. Posted posts can't be changed.
create or replace function public.admin_content_edit(p_id uuid, p_caption text default null, p_platforms text[] default null, p_status text default null) returns public.content_posts language plpgsql security definer set search_path = public as $$ declare r public.content_posts; begin if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if; if p_status is not null and p_status not in ('draft', 'approved', 'rejected') then raise exception 'bad_status'; end if; if p_platforms is not null and not (p_platforms <@ array['tiktok', 'instagram', 'facebook']) then raise exception 'bad_platforms'; end if; update public.content_posts c set caption = coalesce(left(p_caption, 2200), c.caption), platforms = coalesce(p_platforms, c.platforms), status = coalesce(p_status, c.status), approved_at = case when p_status = 'approved' then now() else c.approved_at end, updated_at = now() where c.id = p_id and c.status in ('draft', 'approved', 'rejected', 'failed') returning * into r; if r.id is null then raise exception 'not_editable'; end if; return r; end $$;
revoke all on function public.admin_content_edit(uuid, text, text[], text) from public, anon;
grant execute on function public.admin_content_edit(uuid, text, text[], text) to authenticated;
create or replace function public.admin_autopilot(p_paused boolean default null) returns jsonb language plpgsql security definer set search_path = public as $$ declare v jsonb; begin if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if; if p_paused is not null then update public.content_settings set value = jsonb_build_object('paused', p_paused) where key = 'autopilot'; end if; select value into v from public.content_settings where key = 'autopilot'; return v; end $$;
revoke all on function public.admin_autopilot(boolean) from public, anon;
grant execute on function public.admin_autopilot(boolean) to authenticated;

-- The daily content engine (token from content-token.sql). It only ever sees regions and scores, never coordinates.
create or replace function public.engine_brief(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$ declare d date := public.current_scan(); begin if p_token is null or not exists (select 1 from public.content_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')) then raise exception 'bad_token' using errcode = '42501'; end if; return jsonb_build_object('today', (now() at time zone 'Europe/London')::date, 'scan', d, 'paused', coalesce((select (value->>'paused')::boolean from public.content_settings where key = 'autopilot'), false),
 'spots', (select coalesce(jsonb_agg(t order by t.score desc), '[]') from (select split_part(ls.region, ',', 1) as county, ls.nation, ls.habitat, ls.score, ls.rain14, ls.low, round(ls.elev) as elev from public.live_spots ls where ls.scanned_on = d order by ls.score desc limit 12) t),
 'by_nation', (select coalesce(jsonb_object_agg(t.nation, t.n), '{}') from (select ls.nation, count(*) as n from public.live_spots ls where ls.scanned_on = d group by 1) t),
 'recent_posts', (select coalesce(jsonb_agg(jsonb_build_object('date', c.for_date, 'kind', c.kind, 'title', c.title, 'status', c.status) order by c.created_at desc), '[]') from (select * from public.content_posts order by created_at desc limit 20) c)); end $$;
revoke all on function public.engine_brief(text) from public;
grant execute on function public.engine_brief(text) to anon;
create or replace function public.engine_add(p_token text, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$ declare n int; begin if p_token is null or not exists (select 1 from public.content_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')) then raise exception 'bad_token' using errcode = '42501'; end if; if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 6 then raise exception 'bad_rows'; end if; if (select count(*) from public.content_posts where created_at > now() - interval '20 hours') >= 12 then raise exception 'daily_limit'; end if; insert into public.content_posts (kind, media, title, caption, platforms, ai, brief) select r.kind, r.media, left(r.title, 120), left(r.caption, 2200), coalesce(r.platforms, '{tiktok,instagram,facebook}'), coalesce(r.ai, true), r.brief from jsonb_to_recordset(p_rows) as r(kind text, media jsonb, title text, caption text, platforms text[], ai boolean, brief jsonb); get diagnostics n = row_count; return n; end $$;
revoke all on function public.engine_add(text, jsonb) from public;
grant execute on function public.engine_add(text, jsonb) to anon;
select 'console ready' as status;
