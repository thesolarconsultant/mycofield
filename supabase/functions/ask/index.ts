// MycoField — "Ask about my areas": a chat that explains why one area scores better than another.
// POST {messages: [{role: 'user'|'assistant', content}], context: {...}} with the user's token → streams the
// answer back as plain text. The app sends a snapshot of the readings it already shows (scores, the parts
// of each score, rain, soil, nights, terrain, habitat, the user's own finds); no coordinates.
// Only signed-in accounts with access, and at most ASK_DAILY questions per account per day (supabase/ask.sql).
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY. Optional: ASK_DAILY (default 40),
//   ASK_MODEL (default claude-sonnet-5-5; claude-haiku-4-5 is cheaper, claude-opus-5-5 stronger).
// Deploy with JWT verification OFF (browsers' pre-flight checks carry no token); the user's token is checked here.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = (Deno.env.get('SITE_URL') || 'https://www.mycofield.com').replace(/\/$/, '');
const ORIGINS = new Set([SITE, SITE.replace('://www.', '://'), 'https://mycofield.com', 'https://www.mycofield.com']);
const DAILY = Number(Deno.env.get('ASK_DAILY') || 40);
const MODEL = Deno.env.get('ASK_MODEL') || 'claude-sonnet-5-5';
const HAIKU = MODEL.startsWith('claude-haiku');   // no effort setting or server-side fallback there
const MAX_TURNS = 20, MAX_CHARS = 2000, MAX_CONTEXT = 60000;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
const claude = new Anthropic();   // ANTHROPIC_API_KEY from the function's secrets

// Frozen so it caches: nothing per-user or per-day goes in here.
const SYSTEM = `You are the MycoField assistant, inside a UK app that scores how favourable recent conditions are for grassland fungi (waxcaps, pinkgills, earthtongues, clubs and corals) at places the user tracks.

The user's message starts with a <readings> block: a JSON snapshot of what the app is showing them right now. Each area has its Conditions Index (0–100), the points each input contributed out of its maximum ("parts": rain, soil, balance, nights, terrain, habitat, and a frost penalty), the weather behind it, terrain, habitat and land-survey notes, the index for the coming days, and the user's own logged finds and blanks there. "point" is the spot currently open on the map, if any.

How the index works (model conditions-v0.5): rainfall over 14 days (45 mm = full marks), modelled soil moisture at 3–27 cm (15% scores 0, 40% full), a 50 mm water-balance bucket (rain minus evaporation), cool nights (7-night mean low, best at 8°C, losing points per degree away), frost nights as a penalty, terrain (slope and aspect), and habitat (unimproved grassland and heath score highest; improved grassland, arable and woodland low). Missing inputs are left out and their weight shared, never guessed. Weather comes from grid squares a few kilometres across, so nearby areas often share identical weather and differ only on terrain and habitat.

When asked why one area beats another, compare the parts line by line and name the two or three differences that actually move the score, with the numbers. Say when a difference is only weather-grid noise, when a gap will close or widen in the coming days, and when the user's own finds disagree with the index. Use only the readings given; if something isn't in them, say so rather than guessing. Refer to areas by name.

Keep answers short and plain: a sentence or two, then a few bullets if they help. British English. The index is experimental and not a promise that anything is fruiting; don't give advice on eating wild mushrooms, and point people to the Countryside Code or Scottish Outdoor Access Code if they ask where they may go.`;

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : SITE, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type': 'application/json'}});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return json(req, {error: 'method'}, 405);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json(req, {error: 'not_configured'}, 503);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const {data: auth} = token.includes('.') ? await db.auth.getUser(token) : {data: null};
  const user = auth?.user;
  if (!user) return json(req, {error: 'sign_in_required'}, 401);
  const {data: ent} = await db.from('entitlements').select('paid_until').eq('user_id', user.id).maybeSingle();
  if (!ent?.paid_until || Date.parse(ent.paid_until) <= Date.now()) return json(req, {error: 'access_required'}, 403);

  let body: any; try { body = await req.json(); } catch { return json(req, {error: 'bad_json'}, 400); }
  if (body?.action === 'ping') return json(req, {ok: true, daily: DAILY});
  const turns = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const context = JSON.stringify(body?.context ?? {});
  if (!turns.length || turns[turns.length - 1]?.role !== 'user' || context.length > MAX_CONTEXT) return json(req, {error: 'bad_request'}, 400);
  const messages: Anthropic.MessageParam[] = turns.map((t: any) => ({
    role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content || '').slice(0, MAX_CHARS) || '…'}));
  if (messages[0].role !== 'user') messages.shift();
  // The snapshot rides at the start of the first question, so every later turn reuses it from the cache.
  messages[0] = {role: 'user', content: [{type: 'text', text: `<readings>\n${context}\n</readings>`}, {type: 'text', text: messages[0].content as string}]};

  const {data: used, error: limErr} = await db.rpc('ask_take', {p_user: user.id, p_limit: DAILY});
  if (limErr) { console.error('ask_take', limErr); return json(req, {error: 'not_configured'}, 503); }
  if (used == null) return json(req, {error: 'daily_limit', daily: DAILY}, 429);

  const enc = new TextEncoder();
  // Plain request first-choice extras (effort, server-side fallback) are dropped if Claude rejects them.
  const plain = {model: MODEL, max_tokens: 8000, system: [{type: 'text', text: SYSTEM, cache_control: {type: 'ephemeral'}}], messages};
  const full = HAIKU ? plain : {...plain, output_config: {effort: 'low'}, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'};
  // Why a call failed, in words the owner can act on (no secrets are ever in these messages).
  const why = (e: unknown) => {
    if (e instanceof Anthropic.AuthenticationError) return 'the ANTHROPIC_API_KEY secret was rejected — check it’s pasted in full';
    if (e instanceof Anthropic.PermissionDeniedError) return 'this API key isn’t allowed to use ' + MODEL;
    if (e instanceof Anthropic.NotFoundError) return 'model ' + MODEL + ' isn’t available to this key';
    const m = String((e as any)?.error?.error?.message || (e as Error)?.message || e);
    return /credit/i.test(m) ? 'the Anthropic account needs credit — console.anthropic.com → Billing' : m.slice(0, 160);
  };
  const stream = new ReadableStream({
    async start(ctl) {
      let sent = false;
      const run = async (params: unknown) => {
        const s = (params as any).betas ? claude.beta.messages.stream(params as any) : claude.messages.stream(params as any);
        for await (const ev of s) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { sent = true; ctl.enqueue(enc.encode(ev.delta.text)); }
        }
        return s.finalMessage();
      };
      try {
        let final;
        try { final = await run(full); }
        catch (e) {
          if (sent || full === plain || !(e instanceof Anthropic.BadRequestError)) throw e;
          console.error('ask: retrying without extras', why(e));
          final = await run(plain);
        }
        if (final.stop_reason === 'refusal') ctl.enqueue(enc.encode('\n\nSorry, I can’t help with that one. Try asking about your areas’ readings.'));
        else if (final.stop_reason === 'max_tokens') ctl.enqueue(enc.encode('…'));
      } catch (e) {
        console.error('ask', why(e), e);
        const busy = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500);
        ctl.enqueue(enc.encode(busy ? '\n\nThe assistant is busy right now. Try again in a minute.' : `\n\nSomething went wrong answering that. (${why(e)})`));
      }
      ctl.close();
    },
  });
  return new Response(stream, {headers: {...cors(req), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Ask-Left': String(Math.max(0, DAILY - used))}});
});
