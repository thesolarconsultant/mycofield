-- MycoField: daily question limit for "Ask about my areas". Paste all of it into Supabase → SQL Editor → Run. Safe to run again.
create table if not exists public.ask_usage (user_id uuid not null references auth.users (id) on delete cascade, day date not null, n int not null default 0, primary key (user_id, day));
alter table public.ask_usage enable row level security;
revoke all on public.ask_usage from anon, authenticated;
-- Counts one question; returns the count so far today, or null when the day's limit is already used.
create or replace function public.ask_take(p_user uuid, p_limit int) returns int language plpgsql security definer set search_path = public as $$ declare c int; begin insert into public.ask_usage (user_id, day, n) values (p_user, (now() at time zone 'Europe/London')::date, 1) on conflict (user_id, day) do update set n = ask_usage.n + 1 where ask_usage.n < p_limit returning n into c; return c; end $$;
revoke all on function public.ask_take(uuid, int) from public, anon, authenticated;
grant execute on function public.ask_take(uuid, int) to service_role;
select 'ask ready' as status;
