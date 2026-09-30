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

## Spot credits (£20 = 10 credits, 12 months)
Buyers spend one credit to reveal today's best available spot in the nation they pick (England,
Wales, Scotland, Northern Ireland). A sellable spot scores 90+, sits on confirmed unimproved
(semi-natural) grassland only (no bog or heath), and is on land the public can walk (CRoW open-access or registered common land in England
and Wales, or Scotland's access rights). Each spot goes to at most 5 buyers a week and never twice
to the same buyer; a failed reveal costs nothing. Northern Ireland has no access-land data yet, so
it shows none.

Setup (once):
1. Run `supabase/credits.sql` in the Supabase SQL Editor (also converts old spot packs to 10
   credits and extends existing £8 access to a year).
2. Run `supabase/scanner-token.sql` and save the value it shows as the GitHub Actions secret
   `SPOT_SCANNER_TOKEN` (repo → Settings → Secrets and variables → Actions).
3. Paste the updated `supabase/functions/stripe-webhook/index.ts` into the Edge Function and deploy.
4. The £20 Payment Link (`SPOTS_PAYMENT_LINK`) must be active, with its after-payment redirect set to
   `https://www.mycofield.com/?spots=1`.

The nightly scan (`.github/workflows/spot-scan.yml` → `scanner/scan.cjs`) drives the live app in a
headless browser, so spots are scored by exactly the code users see, and loads them with
`load_live_spots`. Run it by hand from the repo's Actions tab ("Nightly spot scan" → Run workflow).
Buyers only ever see scans at most 2 days old.

## Satellite imagery
The map uses Esri World Imagery through an ArcGIS Location Platform API key (`ESRI_KEY` in
`index.html`). The key is public in the page, as any browser map key is; it should be restricted
in the ArcGIS developer dashboard to the site's referrer URLs and to the Basemaps privilege only.
Leave `ESRI_KEY` empty to drop the satellite option (the map falls back to OpenStreetMap).
