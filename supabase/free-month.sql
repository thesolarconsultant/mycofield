-- MycoField free month: everyone who has an account, and everyone who signs up before the end date, gets full
-- access until 31 October 2026. Paste all of it into Supabase → SQL Editor → Run. Safe to run again.
-- Nobody loses time: anyone already paid past that date keeps their later date.
-- To end the offer early: drop trigger if exists free_month_on_signup on auth.users;
create or replace function public.free_month_end() returns timestamptz language sql immutable as $$ select timestamptz '2026-10-31 23:59:59+00' $$;
-- Everyone already signed up.
insert into public.entitlements (user_id, paid_until) select u.id, public.free_month_end() from auth.users u
on conflict (user_id) do update set paid_until = greatest(public.entitlements.paid_until, excluded.paid_until), updated_at = now();
-- Everyone who signs up before the end date. Never blocks a sign-up if anything goes wrong.
create or replace function public.free_month_grant() returns trigger language plpgsql security definer set search_path = public as $$ begin if now() < public.free_month_end() then begin insert into public.entitlements (user_id, paid_until) values (new.id, public.free_month_end()) on conflict (user_id) do update set paid_until = greatest(public.entitlements.paid_until, excluded.paid_until), updated_at = now(); exception when others then raise warning 'free month grant failed: %', sqlerrm; end; end if; return new; end $$;
revoke all on function public.free_month_grant() from public, anon, authenticated;
drop trigger if exists free_month_on_signup on auth.users;
create trigger free_month_on_signup after insert on auth.users for each row execute function public.free_month_grant();
select count(*) as accounts_with_free_month from public.entitlements where paid_until >= public.free_month_end();
