// MycoField — posts an approved content draft to TikTok, Instagram and Facebook through Upload-Post.
// Called by www.mycofield.com/console with the owner's sign-in token (only emails in public.admins).
// POST {action: 'post', id}   → sends it (async) and marks it "posting"
// POST {action: 'status', id} → asks Upload-Post how it went and marks it "posted" / "failed"
// POST {action: 'check'}      → which secrets are set (for the console's Settings)
// Secrets (Supabase → Edge Functions → Secrets): UPLOAD_POST_API_KEY, UPLOAD_POST_USER (the profile name in
// Upload-Post), optional UPLOAD_POST_FB_PAGE (Facebook Page id, if more than one Page is connected).
// Deploy with JWT verification OFF (browsers' pre-flight checks carry no token); the token is checked here.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = (Deno.env.get('SITE_URL') || 'https://www.mycofield.com').replace(/\/$/, '');
const ORIGINS = new Set([SITE, SITE.replace('://www.', '://'), 'https://mycofield.com', 'https://www.mycofield.com']);
const API = 'https://api.upload-post.com/api';
const KEY = Deno.env.get('UPLOAD_POST_API_KEY') || '', PROFILE = Deno.env.get('UPLOAD_POST_USER') || '', FB_PAGE = Deno.env.get('UPLOAD_POST_FB_PAGE') || '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});

const cors = (req: Request) => {
  const o = req.headers.get('origin') || '';
  return {'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : SITE, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
};
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type': 'application/json'}});

async function admin(req: Request) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t.includes('.')) return false;
  const {data} = await db.auth.getUser(t);
  const email = data?.user?.email?.toLowerCase();
  if (!email) return false;
  const {data: a} = await db.from('admins').select('email').eq('email', email).maybeSingle();
  return !!a;
}

// TikTok photo titles are capped at 90 characters: the first line, trimmed.
const short = (s: string, n: number) => { const l = s.split('\n')[0].trim(); return l.length <= n ? l : l.slice(0, n - 1).trimEnd() + '…'; };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return json(req, {error: 'method'}, 405);
  if (!(await admin(req))) return json(req, {error: 'not_admin'}, 403);
  let body: any; try { body = await req.json(); } catch { return json(req, {error: 'bad_json'}, 400); }
  if (body?.action === 'check') return json(req, {uploadPost: !!KEY, profile: !!PROFILE, facebookPage: !!FB_PAGE});
  if (!KEY || !PROFILE) return json(req, {error: 'not_configured'}, 503);
  const id = String(body?.id || '');
  const {data: post} = await db.from('content_posts').select('*').eq('id', id).maybeSingle();
  if (!post) return json(req, {error: 'not_found'}, 404);
  const mark = (patch: Record<string, unknown>) => db.from('content_posts').update({...patch, updated_at: new Date().toISOString()}).eq('id', id);

  try {
    if (body.action === 'post') {
      if (!['approved', 'failed'].includes(post.status)) return json(req, {error: 'not_approved'}, 409);
      const platforms: string[] = (post.platforms || []).filter((p: string) => ['tiktok', 'instagram', 'facebook'].includes(p));
      const media: {url: string, type: string}[] = Array.isArray(post.media) ? post.media : [];
      if (!platforms.length || !media.length) return json(req, {error: 'nothing_to_post'}, 400);
      const f = new FormData();
      f.append('user', PROFILE);
      for (const p of platforms) f.append('platform[]', p);
      f.append('async_upload', 'true');
      f.append('external_id', id);
      if (FB_PAGE) f.append('facebook_page_id', FB_PAGE);
      if (post.ai) f.append('is_ai_generated', 'true');
      const video = post.kind === 'video' ? media.find(m => m.type === 'video') : null;
      let path;
      if (video) {
        path = '/upload';
        f.append('video', video.url);
        f.append('title', post.caption);
        f.append('description', post.caption);
        f.append('facebook_media_type', 'REELS');
        f.append('media_type', 'REELS');
      } else {
        path = '/upload_photos';
        for (const m of media.filter(m => m.type !== 'video').slice(0, 10)) f.append('photos[]', m.url);
        f.append('title', post.caption);
        f.append('tiktok_title', short(post.title || post.caption, 90));
        f.append('description', post.caption);
      }
      const r = await fetch(API + path, {method: 'POST', headers: {Authorization: `Apikey ${KEY}`, 'Idempotency-Key': `${id}-${post.updated_at}`}, body: f});
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out.success === false && !out.request_id) {
        await mark({status: 'failed', error: String(out.error || out.message || `HTTP ${r.status}`).slice(0, 300), results: out});
        return json(req, {error: 'upload_failed', detail: out.error || out.message || r.status}, 502);
      }
      await mark({status: 'posting', request_id: out.request_id || out.job_id || null, results: out, error: null});
      return json(req, {ok: true, status: 'posting', request_id: out.request_id});
    }
    if (body.action === 'status') {
      if (!post.request_id) return json(req, {status: post.status});
      const r = await fetch(`${API}/uploadposts/status?request_id=${encodeURIComponent(post.request_id)}`, {headers: {Authorization: `Apikey ${KEY}`}});
      const out = await r.json().catch(() => ({}));
      const s = out.status;
      if (s === 'completed') await mark({status: 'posted', posted_at: new Date().toISOString(), results: out});
      else if (s === 'failed' || s === 'not_found') await mark({status: 'failed', error: String(out.message || s).slice(0, 300), results: out});
      else await mark({results: out});
      return json(req, {status: s === 'completed' ? 'posted' : s === 'failed' || s === 'not_found' ? 'failed' : 'posting', detail: out});
    }
    return json(req, {error: 'bad_action'}, 400);
  } catch (e) {
    console.error('publish', body?.action, e);
    return json(req, {error: 'server_error'}, 500);
  }
});
