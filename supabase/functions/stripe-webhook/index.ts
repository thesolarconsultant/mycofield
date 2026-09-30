// MycoField — Stripe webhook → paid access.
// Stripe calls this after a Payment Link checkout. It verifies the Stripe signature, then extends the
// buyer's access by ACCESS_DAYS (£8) or WEEK_DAYS (£2) from today (or from their current expiry, if later). A £20 spots purchase
// instead adds a lot of SPOT_CREDITS credits valid for CREDIT_MONTHS. The in-app checkout (functions/checkout)
// grants the same thing when the buyer returns; whichever runs first does it, the payments row stops the other.
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_WEBHOOK_SECRET (whsec_…).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
// Deploy with JWT verification OFF — Stripe does not send a Supabase token; the signature check is the auth.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ACCESS_DAYS = 365;        // £8 = a year
const WEEK_DAYS = 7;            // £2 = a week
const SPOT_CREDITS = 10, CREDIT_MONTHS = 12;  // £20 = 10 spot credits for 12 months
const TOLERANCE_S = 300;
const enc = new TextEncoder();

async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  const expected = Array.from(mac, b => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison against every v1 signature Stripe sent.
  return sigs.some(s => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('Webhook secret not configured', {status: 500});
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)))
    return new Response('Bad signature', {status: 400});

  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded')
    return new Response('ignored', {status: 200});
  const s = event.data?.object ?? {};
  // 'no_payment_required' = a 100%-off promo code; still a completed checkout.
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required')
    return new Response('not paid yet', {status: 200});
  // What was bought comes from the session our checkout made (metadata) or, for the old Payment Links, the
  // price before discounts (£8 vs £20) — never from client_reference_id, which a buyer can edit in the URL.
  const sub = s.amount_subtotal ?? 0;
  const product = ['spots', 'access', 'week'].includes(s.metadata?.product) ? s.metadata.product
    : sub >= 2000 ? 'spots' : sub > 0 && sub <= 200 ? 'week' : 'access';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  // Who: the signed-in buyer's account id if the checkout carried one, else the account for the email they
  // paid with (made now if new — paying confirms the email; they sign in with it and everything's there).
  let userId = /^(?:spots_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(s.client_reference_id ?? '')?.[1];
  const email = s.customer_details?.email ?? s.customer_email ?? null;
  if (!userId && email) {
    let r = await db.auth.admin.generateLink({type: 'magiclink', email});
    if (r.error) { await db.auth.admin.createUser({email, email_confirm: true}); r = await db.auth.admin.generateLink({type: 'magiclink', email}); }
    userId = r.data?.user?.id;
  }
  if (!userId) {
    console.error('Paid session without a MycoField account or email', s.id);
    return new Response('no user — grant manually', {status: 200});
  }

  // Idempotency: record the session first; a duplicate webhook stops here.
  const {error: dup} = await db.from('payments').insert({id: s.id, user_id: userId, email: s.customer_details?.email ?? null, amount: s.amount_total ?? null, currency: s.currency ?? null});
  if (dup) {
    if (dup.code === '23505') return new Response('already processed', {status: 200});
    console.error('payments insert failed', dup);
    return new Response('db error', {status: 500});
  }
  if (product === 'spots') {
    const exp = new Date(); exp.setUTCMonth(exp.getUTCMonth() + CREDIT_MONTHS);
    const {error} = await db.from('credit_lots').insert({user_id: userId, qty: SPOT_CREDITS, remaining: SPOT_CREDITS, expires_at: exp.toISOString(), payment_id: s.id});
    if (error && error.code !== '23505') { console.error('credit lot insert failed', error); await db.from('payments').delete().eq('id', s.id); return new Response('db error', {status: 500}); }
    return new Response(JSON.stringify({ok: true, credits: SPOT_CREDITS, expires_at: exp.toISOString()}), {status: 200, headers: {'Content-Type': 'application/json'}});
  }
  const {data: cur} = await db.from('entitlements').select('paid_until').eq('user_id', userId).maybeSingle();
  const from = Math.max(Date.now(), cur?.paid_until ? Date.parse(cur.paid_until) : 0);
  const paidUntil = new Date(from + (product === 'week' ? WEEK_DAYS : ACCESS_DAYS) * 864e5).toISOString();
  const {error} = await db.from('entitlements').upsert({user_id: userId, paid_until: paidUntil, updated_at: new Date().toISOString()});
  if (error) { console.error('entitlement upsert failed', error); await db.from('payments').delete().eq('id', s.id); return new Response('db error', {status: 500}); }
  return new Response(JSON.stringify({ok: true, paid_until: paidUntil}), {status: 200, headers: {'Content-Type': 'application/json'}});
});
