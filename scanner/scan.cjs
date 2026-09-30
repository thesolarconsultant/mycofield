// MycoField nightly spot scanner.
// Drives the live app (www.mycofield.com) in a headless browser so every spot is scored by exactly the
// code users see, then loads the day's sellable spots into Supabase (supabase/credits.sql).
// A sellable spot: Conditions Index 90+, confirmed unimproved (semi-natural) grassland only — grassland fungi
// ground, never bog or heath — and on land the public can
// walk (open-access or registered common land in England and Wales; Scotland's access rights).
// Needs SPOT_SCANNER_TOKEN (make one with supabase/scanner-token.sql). DRY_RUN=1 skips the upload.
const {chromium} = require('playwright');
const fs = require('fs');

const SITE = 'https://www.mycofield.com/';
const SUPABASE_URL = 'https://abgbzdairkgakmqscvyo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6Gjfyb4Q61ew6ym-22YSQw_NF-KuxSv';  // public by design
const TOKEN = process.env.SPOT_SCANNER_TOKEN, DRY = process.env.DRY_RUN === '1';
const MIN_SCORE = 90, SHORTLIST = Number(process.env.SHORTLIST || 85);  // squares whose weather is 85+ get the full index
const GOOD = new Set(['semi-natural-grassland']);
const WORKERS = 4, SPACING_KM = 3;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const km = (a, b) => { const t = x => x * Math.PI / 180; return 12742 * Math.asin(Math.sqrt(Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lon - a.lon) / 2) ** 2)); };
const ukDate = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Europe/London'});

async function openApp(ctx) {
  for (let a = 1; ; a++) {
    const p = await ctx.newPage();
    try { await p.goto(SITE); await p.waitForFunction(() => window.__mf, null, {timeout: 60000}); return p; }
    catch (e) { await p.close().catch(() => {}); if (a >= 3) throw e; log('app load retry', a); }
  }
}

(async () => {
  if (!TOKEN && !DRY) throw new Error('SPOT_SCANNER_TOKEN is not set');
  const browser = await chromium.launch();
  // No service worker: its cached copy of the app would skip the hook below in extra tabs.
  const ctx = await browser.newContext({serviceWorkers: 'block'});
  // Expose the app's own scoring functions and open the paywall for this private run.
  await ctx.route(/^https:\/\/www\.mycofield\.com\/(\?.*)?$/, async r => {
    const res = await r.fetch(); let t = await res.text();
    t = t.replace(/const STRIPE_PAYMENT_LINK = '[^']*';/, "const STRIPE_PAYMENT_LINK = '';")
         .replace('window.mycofield = {', 'window.__mf = {fetchReadyBatch, ready, fetchPointWeather, analyseTerrain, fetchHabitat, habitatUnavailable, buildPointResult}; window.mycofield = {');
    if (!t.includes('window.__mf')) throw new Error('App changed: scanner hook not found');
    r.fulfill({response: res, body: t, headers: {...res.headers(), 'content-type': 'text/html'}});
  });
  // If the main Overpass server refuses us, ask a public mirror of the same OpenStreetMap database.
  await ctx.route(/overpass-api\.de/, async r => {
    try { const res = await r.fetch({timeout: 25000}); if (res.ok()) return r.fulfill({response: res}); } catch {}
    try { const res = await r.fetch({url: r.request().url().replace('https://overpass-api.de/api/', 'https://maps.mail.ru/osm/tools/overpass/api/'), timeout: 40000}); return r.fulfill({response: res, headers: {...res.headers(), 'access-control-allow-origin': '*'}}); }
    catch { return r.abort(); }
  });
  const main = await openApp(ctx);
  log('app loaded');

  // 1. Weather across the UK on the app's own 0.2° grid (the ready-ground overlay's scoring).
  // BBOX="south,west,north,east" limits a test run to one area.
  const [S0, W0, N0, E0] = (process.env.BBOX || '49.9,-8.2,60.9,1.8').split(',').map(Number);
  const step = 0.2, ls = step * 1.6, cells = [];
  for (let r = Math.floor(S0 / step); r * step < N0; r++)
    for (let q = Math.floor(W0 / ls); q * ls < E0; q++)
      cells.push({key: `${step}:${r}:${q}`, r, q, step, lonStep: ls, lat: +(r * step + step / 2).toFixed(4), lon: +(q * ls + ls / 2).toFixed(4)});
  // Ireland is never sold, so don't spend weather requests on it (Kintyre, Islay and the Rhins stay; Cornwall
  // and Pembrokeshire sit south of 51.3° or east of 5.35°W).
  const inIreland = (lat, lon) => lat > 51.3 && lat < 55.45 && lon < -5.35 && !(lat > 55.25 && lon > -5.9);
  const all = cells.length; cells.splice(0, cells.length, ...cells.filter(c => !inIreland(c.lat, c.lon)));
  log(`grid: ${cells.length} squares (${all - cells.length} in Ireland skipped)`);
  const land = [];
  for (let i = 0; i < cells.length; i += 100) {
    const batch = cells.slice(i, i + 100);
    for (let a = 0; a < 5; a++) {
      try {
        const res = await main.evaluate(async cs => { await __mf.fetchReadyBatch(cs); return cs.map(c => __mf.ready.cells.get(c.key)?.score ?? null); }, batch);
        batch.forEach((c, k) => { if (res[k] != null) land.push({...c, w: res[k]}); });
        break;
      } catch (e) { log('weather retry', String(e).slice(0, 90)); await sleep(30000); }
    }
    await sleep(7000);
  }
  const strong = land.filter(c => c.w >= SHORTLIST);
  log(`weather: ${land.length} land squares, ${strong.length} at ${SHORTLIST}+`);

  // 2. Full index at four points in each strong square.
  const pts = [];
  for (const c of strong) for (const [fy, fx] of [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25], [0.75, 0.75]])
    pts.push({lat: +(c.r * step + step * fy).toFixed(4), lon: +(c.q * ls + ls * fx).toFixed(4)});
  const pages = [main, ...await Promise.all(Array.from({length: WORKERS - 1}, () => openApp(ctx)))];
  const scored = [], retried = {habitat: 0}; let next = 0;
  await Promise.all(pages.map(async p => {
    while (next < pts.length) {
      const pt = pts[next++];
      try {
        const r = await p.evaluate(async ({lat, lon}) => {
          const m = __mf, h = m.fetchHabitat(lat, lon, {}).catch(m.habitatUnavailable);
          const [w, t] = await Promise.allSettled([m.fetchPointWeather(lat, lon, {}), m.analyseTerrain(lat, lon, {})]);
          let ha = await h, res = m.buildPointResult(lat, lon, w, t, ha, null, null), L = ha?.land || {}, habitatRetries = 0;
          // A strong square whose habitat maps didn't answer (busy servers) gets two more goes; answers already
          // received are cached, so only the layers that failed are asked again. Ground the maps simply don't
          // record isn't retried: that's an answer, not a failure.
          while (habitatRetries < 2 && (res.conditions?.score ?? 0) >= 85 && (ha?.unavailable || L.unavailable || L.partial)) {
            habitatRetries++;
            await new Promise(r => setTimeout(r, 4000 * habitatRetries));
            ha = await m.fetchHabitat(lat, lon, {}).catch(m.habitatUnavailable);
            res = m.buildPointResult(lat, lon, w, t, ha, null, null); L = ha?.land || {};
          }
          if (w.status === 'rejected') return {weatherFailed: String(w.reason?.message || w.reason).slice(0, 80)};
          return {score: res.conditions?.score ?? null, cls: res.habitat?.cls || null, habitat: res.habitat?.label || null,
            nation: L.covered ? L.nation : null, accessLand: L.accessLand ?? null, commonLand: L.commonLand || null, grazing: L.grazing || null,
            rain14: res.weather?.rain14 ?? null, low: res.weather?.latestLow ?? null, elev: res.terrain?.elevation ?? null, habitatRetries};
        }, pt);
        // The weather API allows so many calls a minute; a square that hits the limit waits and goes round again.
        if (r.weatherFailed) {
          if ((pt.tries || 0) < 3) { log('weather limit, retrying', pt.lat, pt.lon, r.weatherFailed); pts.push({...pt, tries: (pt.tries || 0) + 1}); await sleep(61000); continue; }
          log('point gave up (weather)', pt.lat, pt.lon); continue;
        }
        if (r.habitatRetries) retried.habitat++;
        scored.push({...pt, ...r});
      } catch (e) { log('point failed', pt.lat, pt.lon, String(e).slice(0, 80)); }
      if (scored.length % 50 === 0) log(`scored ${scored.length}/${pts.length}`);
      await sleep(400);
    }
  }));

  // 3. Keep only sellable spots, best first, at least SPACING_KM apart.
  const accessOf = s => s.nation === 'Scotland' ? 'Scottish access rights (Outdoor Access Code)'
    : s.accessLand ? 'Open access land (CRoW)' : s.commonLand ? `Registered common land${typeof s.commonLand === 'string' && s.commonLand !== 'Registered common land' ? `: ${s.commonLand}` : ''}` : null;
  log('scored:', JSON.stringify(scored.map(s => [s.lat, s.lon, s.score, s.cls, s.nation, s.accessLand, s.commonLand ? 1 : 0])));
  const ok = scored.filter(s => s.score >= MIN_SCORE && GOOD.has(s.cls) && ['England', 'Wales', 'Scotland'].includes(s.nation) && accessOf(s))
    .sort((a, b) => b.score - a.score);
  const keep = [];
  for (const s of ok) if (keep.every(k => km(k, s) >= SPACING_KM)) keep.push(s);
  log(`habitat retried at ${retried.habitat} strong points`);
  log(`sellable: ${keep.length} (of ${scored.length} scored)`, Object.entries(keep.reduce((m, s) => (m[s.nation] = (m[s.nation] || 0) + 1, m), {})));

  // 4. Name each spot after its nearest place (OpenStreetMap Nominatim, 1 request a second).
  for (const s of keep) {
    s.name = `${s.nation} spot ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}`; s.region = s.nation;
    for (const extra of ['&zoom=14', '&layer=natural&zoom=14']) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${s.lat}&lon=${s.lon}&addressdetails=1${extra}`, {headers: {'User-Agent': 'MycoField spot scanner (help@mycofield.com)'}});
        const j = await r.json(), a = j.address || {};
        const place = extra.includes('natural') ? j.name : a.hamlet || a.village || a.locality || a.suburb || a.town;
        if (a.county || a.state_district) s.region = `${a.county || a.state_district}, ${s.nation}`;
        if (place) { s.name = place; break; }
      } catch {}
      await sleep(1100);
    }
    await sleep(1100);
  }

  const rows = keep.map(s => ({spot_key: `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`, nation: s.nation, name: s.name, region: s.region,
    lat: s.lat, lon: s.lon, score: s.score, habitat: s.habitat, access: accessOf(s),
    grazing: s.grazing === 'recorded' ? 'Stock grazing recorded (NRW)' : null,
    rain14: s.rain14 != null ? Math.round(s.rain14) : null, low: s.low, elev: s.elev != null ? Math.round(s.elev) : null}));
  fs.writeFileSync('spots.json', JSON.stringify(rows, null, 1));
  await browser.close();
  if (DRY) { log('dry run: wrote spots.json, nothing uploaded'); return; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/load_live_spots`, {method: 'POST',
    headers: {apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({p_token: TOKEN, p_scanned_on: ukDate(), p_rows: rows})});
  const body = await res.text();
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${body.slice(0, 200)}`);
  log(`uploaded ${body} spots for ${ukDate()}`);
})().catch(e => { console.error(e); process.exit(1); });
