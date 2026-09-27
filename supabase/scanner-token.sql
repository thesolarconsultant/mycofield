-- Makes the password the nightly spot scanner uses. Run once in Supabase → SQL Editor.
-- Copy the value it shows straight into GitHub → the mycofield repo → Settings → Secrets and
-- variables → Actions → New repository secret, named SPOT_SCANNER_TOKEN. Don't paste it anywhere else.
-- Running this again makes a new token and retires the old ones.
delete from public.scanner_tokens;
with t as materialized (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token),
ins as (insert into public.scanner_tokens (token_hash) select encode(sha256(convert_to(token, 'UTF8')), 'hex') from t)
select token as spot_scanner_token from t;
