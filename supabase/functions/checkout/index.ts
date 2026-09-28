// MycoField — in-app checkout.
// POST {action:'start', product:'access'|'spots'} → an embedded Stripe Checkout session for the card in the app.
//   The price is set here, never by the browser: access = £8 for a year, spots = £20 for 10 credits.
//   Signed-in callers (Authorization: Bearer <user token>) buy for their own account; anyone else pays
//   first and their account is the email they give Stripe.
// POST {action:'claim', sessionId} → after Stripe sends the buyer back (?cs=…): checks the session is paid,
//   makes the account for the Stripe email if there isn't one, grants what was bought (same as the webhook;
//   whichever runs first does it, the other sees it's done), and — for a buyer who wasn't signed in — returns
//   a one-time sign-in token so the app signs them straight in. Paying proves the email.
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY (sk_live_… or a restricted key with
//   Checkout Sessions write), STRIPE_PUBLISHABLE_KEY (pk_live_…). Optional: SITE_URL (default https://www.mycofield.com).
// Deploy with JWT verification OFF (anyone can start a checkout; a user token is checked here when sent).
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRODUCTS = {
  access: {amount: 800, name: 'MycoField — a year of full access', description: 'Conditions for any spot, official habitat maps, synced areas and records. One payment, no subscription.'},
  week: {amount: 200, name: 'MycoField — 7 days of full access', description: 'A week of conditions, habitat maps and synced records. One payment, no subscription.'},
  spots: {amount: 2000, name: 'MycoField — 10 spot credits', description: 'Each credit reveals the day’s best spot in the nation you pick. Valid 12 months.'},
} as const;
type Product = keyof typeof PRODUCTS;
const ACCESS_DAYS = 365, WEEK_DAYS = 7, SPOT_CREDITS = 10, CREDIT_MONTHS = 12;
const CLAIM_WINDOW_S = 48 * 3600;   // a return link signs in only within 2 days of paying
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = (Deno.env.get('SITE_URL') || 'https://www.mycofield.com').replace(/\/$/, '');
const ORIGINS = new Set([SITE, SITE.replace('://www.', '://'), 'https://mycofield.com', 'https://www.mycofield.com']);

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : SITE, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type': 'application/json'}});

// Stripe's API takes form encoding with bracketed keys.
function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, init: {method?: string, body?: Record<string, unknown>} = {}) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {method: init.method || 'GET',
    headers: {Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded'},
    body: init.body ? form(init.body) : undefined});
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Stripe ${r.status}`);
  return data;
}

// What a paid session bought. Our sessions carry it in metadata; old Payment Links are told apart by the
// price before discounts (£8 vs £20), never by anything the buyer can edit.
export function productOf(s: {metadata?: Record<string, string>, amount_subtotal?: number}): Product {
  const m = s.metadata?.product;
  if (m === 'access' || m === 'spots' || m === 'week') return m;
  const sub = s.amount_subtotal ?? 0;
  return sub >= PRODUCTS.spots.amount ? 'spots' : sub > 0 && sub <= PRODUCTS.week.amount ? 'week' : 'access';
}

// The account for an email: made if new (already confirmed — they just paid with it), and a one-time
// sign-in token for it.
async function accountFor(email: string) {
  let r = await db.auth.admin.generateLink({type: 'magiclink', email});
  if (r.error) {
    const made = await db.auth.admin.createUser({email, email_confirm: true});
    if (made.error && !/already|registered|exists/i.test(made.error.message)) throw made.error;
    r = await db.auth.admin.generateLink({type: 'magiclink', email});
    if (r.error) throw r.error;
  }
  return {userId: r.data.user.id, tokenHash: r.data.properties.hashed_token};
}

// Grant a paid session once. Returns what the buyer now has.
async function fulfil(s: any, userId: string, product: Product) {
  const {error: dup} = await db.from('payments').insert({id: s.id, user_id: userId, email: s.customer_details?.email ?? null, amount: s.amount_total ?? null, currency: s.currency ?? null});
  if (dup && dup.code !== '23505') throw dup;
  if (!dup) {
    if (product === 'spots') {
      const exp = new Date(); exp.setUTCMonth(exp.getUTCMonth() + CREDIT_MONTHS);
      const {error} = await db.from('credit_lots').insert({user_id: userId, qty: SPOT_CREDITS, remaining: SPOT_CREDITS, expires_at: exp.toISOString(), payment_id: s.id});
      if (error && error.code !== '23505') { await db.from('payments').delete().eq('id', s.id); throw error; }
    } else {
      const {data: cur} = await db.from('entitlements').select('paid_until').eq('user_id', userId).maybeSingle();
      const from = Math.max(Date.now(), cur?.paid_until ? Date.parse(cur.paid_until) : 0);
      const {error} = await db.from('entitlements').upsert({user_id: userId, paid_until: new Date(from + (product === 'week' ? WEEK_DAYS : ACCESS_DAYS) * 864e5).toISOString(), updated_at: new Date().toISOString()});
      if (error) { await db.from('payments').delete().eq('id', s.id); throw error; }
    }
  }
}

async function caller(req: Request) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t || !t.includes('.')) return null;           // the publishable key isn't a user token
  const {data} = await db.auth.getUser(t);
  return data?.user ?? null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return json(req, {error: 'method'}, 405);
  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('STRIPE_PUBLISHABLE_KEY')) return json(req, {error: 'not_configured'}, 503);
  let body: any; try { body = await req.json(); } catch { return json(req, {error: 'bad_json'}, 400); }
  try {
    if (body.action === 'ping') return json(req, {ok: true});   // the app uses this to know the checkout is live
    if (body.action === 'start') {
      const product = (['spots', 'week'].includes(body.product) ? body.product : 'access') as Product, p = PRODUCTS[product];
      const user = await caller(req);
      const s = await stripe('checkout/sessions', {method: 'POST', body: {
        ui_mode: 'embedded', mode: 'payment', return_url: `${SITE}/?cs={CHECKOUT_SESSION_ID}`,
        line_items: {0: {quantity: 1, price_data: {currency: 'gbp', unit_amount: p.amount, product_data: {name: p.name, description: p.description}}}},
        allow_promotion_codes: 'true', metadata: {product}, payment_intent_data: {description: p.name},
        ...(user ? {client_reference_id: user.id, customer_email: user.email} : {}),
      }});
      return json(req, {clientSecret: s.client_secret, publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY'), product});
    }
    if (body.action === 'claim') {
      const id = String(body.sessionId || '');
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json(req, {error: 'bad_session'}, 400);
      const s = await stripe(`checkout/sessions/${id}`);
      if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(s.payment_status)) return json(req, {error: 'not_paid', status: s.status}, 409);
      const product = productOf(s), email = s.customer_details?.email || s.customer_email;
      const ref = /^(?:spots_)?([0-9a-f-]{36})$/i.exec(s.client_reference_id || '')?.[1];
      if (ref && UUID.test(ref)) { await fulfil(s, ref, product); return json(req, {ok: true, product, signedIn: true}); }
      if (!email) return json(req, {error: 'no_email'}, 409);
      const acct = await accountFor(email);
      await fulfil(s, acct.userId, product);
      const fresh = Date.now() / 1000 - s.created < CLAIM_WINDOW_S;
      return json(req, {ok: true, product, email, ...(fresh ? {tokenHash: acct.tokenHash} : {})});
    }
    return json(req, {error: 'bad_action'}, 400);
  } catch (e) {
    console.error('checkout', body?.action, e);
    return json(req, {error: String((e as Error)?.message || e)}, 500);
  }
});
