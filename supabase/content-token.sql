-- Makes the password the daily content engine uses. Run once in Supabase → SQL Editor, after console.sql.
-- Copy the value it shows straight into claude.ai → Claude Code → this environment's settings → Environment
-- variables, as CONTENT_TOKEN=<value>. Don't paste it anywhere else. Running this again retires the old one.
delete from public.content_tokens;
with t as materialized (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token),
ins as (insert into public.content_tokens (token_hash) select encode(sha256(convert_to(token, 'UTF8')), 'hex') from t)
select token as content_token from t;
