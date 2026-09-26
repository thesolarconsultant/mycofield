# MycoField

Environmental intelligence for general grassland-fungi habitat and phenology research.
A static, installable PWA: `index.html` + `sw.js` + `manifest.webmanifest`. No build step, no framework.

## Features
- **Map**: MapLibre 3D terrain over OpenStreetMap, 3D/flat toggle, four tracked research areas
  with live Conditions Index markers and a strongest-area card.
- **Exact Point Intelligence**: tap any point for live weather, elevation, slope, aspect,
  experimental Terrain Context and Conditions Index. Tap any coordinates to copy them.
- **Search**: towns, landmarks, UK postcodes or `lat, lon`; the result is analysed as an exact point. Send it to the field log as a private location.
- **Signal**: tracks every area and sub-area at once (index, trend, sparkline, rain, low), with
  full detail — 10-day outlook, sparklines, score breakdown — for the focused area.
- **Areas & sub-areas**: save any analysed spot as a new area or as a sub-area of an existing one;
  rename or delete areas from Signal.
- **History**: observation log (positives *and* blanks) with Analyse, which rebuilds the
  30 days of weather before each record.
- **Log**: field observations with optional private coordinates and an environmental snapshot.

## Brand
Colours, type and components follow the MycoField brand sheet: Forest Green `#0B3D2E`,
Moss Green `#6DAA2C`, Signal Lime `#A7D82E`, Stone Beige `#E7E1D2`, Off White `#FAFAF6`,
with Sky Blue, Sage, Warm Amber and Slate accents; Montserrat headlines, Inter body.
Logo files live in `assets/` (`logo.png`, `logo-mark.png`).

## Data sources
| Data | Source |
| --- | --- |
| Forecast + recent weather | Open-Meteo Forecast API (`past_days=14`, `forecast_days=10`) |
| Historical weather | Open-Meteo Archive API (Forecast API past days for the last week) |
| Elevation | Open-Meteo Elevation API (Copernicus DEM, ~90 m) |
| Soil moisture, evapotranspiration | Open-Meteo land-surface model / FAO-56 ET₀ |
| Habitat | OpenStreetMap land use via Overpass, refined by official habitat data (or set in the field) |
| Land & grazing — Wales | NRW LANDMAP habitat + land management (stock grazing etc.), grassland-fungi potential habitat, open-access land (DataMapWales) |
| Land — England | Natural England Priority Habitat Inventory, Living England, registered common land; RPA Crop Map of England 2023 |
| Land — Scotland | NatureScot Habitat Map of Scotland |
| Place search | OpenStreetMap Nominatim; UK postcodes via postcodes.io |
| Map / terrain | OpenStreetMap tiles, MapLibre demo terrain DEM |

## Model (experimental, `conditions-v0.5`)
Rainfall 25% · modelled soil moisture 20% · water balance (rain − evapotranspiration) 15% ·
7-night mean low 20% · terrain 10% · habitat 10% · frost penalty. Missing inputs are excluded
and reported, never guessed. Full details, resolution limits and the validation method are in
[`METHODOLOGY.md`](METHODOLOGY.md). Nothing here is scientifically validated yet; the Evidence
panel on the History tab measures how well the index separates your finds from your blanks.

## Privacy
Observations and any attached coordinates are stored only in this browser's localStorage
(`mycofield-history-v2`); saved areas in `mycofield-areas-v1`. Nothing is uploaded.

## Run locally
    python3 -m http.server 8000
Then open http://localhost:8000

## Releasing
Bump `CACHE` in `sw.js` and `VERSION` with each release so installed PWAs pick up the new build.

## Account & sync (optional)
Cloud backup uses Supabase (free tier is enough). One-time setup:
1. Supabase → **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql).
2. **Authentication → URL Configuration**: set Site URL to the app's address and add it to
   Redirect URLs.
3. **Authentication → Emails → Magic Link** template: add `{{ .Token }}` so the email also
   contains a code (needed for the installed home-screen app).
4. Put the project URL and the **anon/public** key in `SUPABASE_URL` / `SUPABASE_ANON_KEY` in
   `index.html`. Never use the service_role key in the app. Until the key is set, the sync card
   is hidden and the app is purely on-device.

## Spot pack (£20 add-on) — withdrawn
**Switched off in 2.21.0** (`SPOTS_ENABLED = false` in `index.html`): the sites did not meet the quality bar.
Deactivate the £20 Payment Link in Stripe. Set the flag back to `true` to bring it back.

Paid users are offered, once, a set of 10 spots chosen from their postcode. Spots are 1 km squares
ranked by the number of waxcap species recorded there since 2000 (NBN Atlas records under CC-BY,
CC0 or OGL), with access and protected-site status looked up per site; the list itself lives only
in Supabase. Allocation (`claim_spots`): up to six tier 1–2 sites within 80 km, then tier-1 sites
anywhere in Britain nearest first, and only then lesser sites.
1. Run `supabase/spots.sql` in the SQL Editor.
2. Add spots in Table Editor → `spots` (name, lat, lon, nation, region, tier 1–3, access, notes).
3. Create a £20 Stripe Payment Link (done: `5kQ4gy1…`) with its after-payment redirect set to
   `https://www.mycofield.com/?spots=1`, and put it in `SPOTS_PAYMENT_LINK` in `index.html`.
4. Redeploy the `stripe-webhook` Edge Function (it recognises `client_reference_id=spots_<user id>`).

The spots never ship in the app. `claim_spots()` picks a buyer's set once, stores it on their
`spot_packs` row, and only ever returns that set; the `spots` table itself is unreadable to users.

## Satellite imagery
The map uses Esri World Imagery through an ArcGIS Location Platform API key (`ESRI_KEY` in
`index.html`). The key is public in the page, as any browser map key is; it should be restricted
in the ArcGIS developer dashboard to the site's referrer URLs and to the Basemaps privilege only.
Leave `ESRI_KEY` empty to drop the satellite option (the map falls back to OpenStreetMap).
