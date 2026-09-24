# Changelog

## 2.11.0 — Paid access (ready, switched off until the Stripe link is set)

### Added
- New visitors get a 30-second walkthrough (auto-advancing, skippable), then a 30-second free
  look with postcode search focused, then a paywall: sign in by email, then pay £8 once for
  3 months through a Stripe Payment Link (account id + email passed to Stripe).
- `supabase/paywall.sql`: `entitlements` (users can read only their own expiry) and `payments`
  (idempotency). `supabase/functions/stripe-webhook`: verifies Stripe's signature (HMAC-SHA256,
  5-minute replay window, constant-time compare) and extends access by 90 days.
- Back from Stripe (`?paid=1`) the app confirms the payment and unlocks; paid users open straight
  in and keep working offline; expired access shows a renew screen. Account card shows the expiry.
- Sign-in links also work when the app is already open in the same tab.

### Changed
- Coordinates are now **tap-to-copy** (with a copy icon and a “Copied” confirmation) instead of
  opening Google Earth. Always copies 5 decimal places (~1 m), ready to paste into any map app.

## 2.10.0 — Account & sync (Supabase)

### Added
- **Sign in by email** (History → Account & sync): a one-tap link or a code from the email, no
  passwords. Works in the installed home-screen app too, where email links open in the browser.
- **Cloud backup and sync** of saved areas, sub-areas and every find and blank between devices.
  Local-first: the app keeps working offline and syncs when back online, when reopened, and a
  few seconds after any change. Existing on-device data is uploaded on first sign-in; built-in
  demo records never are. Deletions sync; an unsynced change on this device wins over the server.
- `supabase/schema.sql`: tables, triggers and **row-level security** so each account can only
  read and write its own rows; no access for signed-out visitors.
- No Supabase SDK: Auth and PostgREST are called directly with `fetch`.

## 2.9.0 — Land & grazing across Great Britain

### Added
- **England**: Natural England Priority Habitat Inventory (mapped semi-natural habitat), RPA Crop
  Map of England 2023 (grass vs crop per field), Living England (satellite habitat, used only to
  flag improved grassland) and registered common land.
- **Scotland**: NatureScot Habitat Map of Scotland (EUNIS/NVC survey habitat).
- Border areas query every candidate nation; the one whose national layers contain the point wins.
- **Grazing in Field notes** for everywhere: stock now / grazed this year / ungrazed for years /
  mown, and the animal. Stored with the record, exported, and compared in Evidence.
- Evidence gains "Grazed — your field log" and "Grass, not crop, in 2023 (England)".

### Changed
- Model `conditions-v0.5`: the habitat input uses official survey habitat in England and Scotland
  as well as Wales. Grazing is still displayed and recorded, not scored. Re-analyse records in
  Evidence.

## 2.8.0 — Land & grazing (Wales)

### Added
- **Land & grazing** on every point in Wales, from Natural Resources Wales open data
  (DataMapWales WFS, point-in-polygon, cached 180 days): LANDMAP surveyed habitat and land
  management (stock grazing, mowing, cultivation…), NRW's potential habitat for grassland fungi,
  and open-access land. Shown on the point sheet ("stock grazing" metric + plain-language
  summary) and in Conditions → Inputs.
- Grazing and fungi-zone status are stored with every observation snapshot and history rewind,
  exported (CSV/JSON/GeoJSON), and compared between finds and blanks in Evidence.

### Changed
- Model `conditions-v0.4`: in Wales the habitat input uses LANDMAP's surveyed habitat instead of
  broad OSM land use, separating **improved grassland** (new class, 30) from semi-natural
  grassland (100); new **arable** class (10). Specific OSM cover (woods, water, buildings, lawns)
  still wins. Grazing is displayed and recorded but deliberately **not scored** until the
  evidence supports it. Existing records need re-analysing under v0.4 in Evidence.

## 2.7.0 — Conditions model v0.3 and evidence

### Added
- **Soil moisture** (Open-Meteo land-surface model, 3–27 cm) as an input.
- **Water balance**: 50 mm soil bucket, rain minus FAO-56 evapotranspiration, replacing the
  rain-only moisture memory (kept as a fallback). Forecast now fetches 30 past days for spin-up.
- **7-night mean low** instead of a single night, and a **frost penalty** (−5 per frost night, max −15).
- **Habitat** from OpenStreetMap land-use mapping (Overpass, throttled, cached 90 days), with a
  field override on the point sheet that is carried into saved areas and observations.
- **Missing inputs are no longer filled with neutral values**: weights are shared across
  available inputs and every score shows its completeness.
- **Weather grid honesty**: each analysis shows how far away the model grid point is;
  sub-areas that share their parent's grid cell are flagged.
- **Evidence panel** (History): analyse all records under the current model, then compare finds
  vs blanks per input with averages and AUC, with an explicit verdict and direction.
- **Exports**: CSV, JSON and GeoJSON of all observations with their environmental data.
- **Inputs & data quality** table and "How the index works" on the Conditions tab;
  `METHODOLOGY.md` documents the model in full.

### Changed
- Model version is now `conditions-v0.3`. History rewinds use 45 days of archive weather plus
  archive soil moisture, and record their model version, grid cell and habitat source.

## 2.6.1 — Locked, minimal navigation

### Changed
- Bottom nav slimmed from 68 px to 56 px (+ iPhone home-indicator space), icon-first with
  short labels (Map · Conditions · History · Notes) and a small lime pill on the active tab.
- Nav height is fixed and the Map tab can no longer scroll or rubber-band, so the nav and
  map never shift while panning. No double-tap zoom or long-press selection on the bar.
- Active tab is announced to screen readers (`aria-current`).

## 2.6.0 — Mobile-first map

### Changed
- **Full-screen map on phones.** The Map tab hides the header, the area dropdown and the
  always-on area card. One floating search bar (with the logo) sits at the top.
- **Bottom sheets instead of cards.** Tapping the map, a search result or an area opens a
  compact peek sheet (score, label, 4 key numbers, actions). Swipe up or tap ▴ for full
  detail; swipe down or ✕ to dismiss. The map pans so the point stays visible.
- **Saved areas are optional.** Hidden from the map by default and behind the Saved
  (bookmark) button in the search bar: strongest area, list of areas and sub-areas, and a
  "Show saved areas on the map" switch (remembered). Their weather only loads when you open
  Saved or Conditions, so opening the app makes no area requests.
- Single 3D/2D button (remembered), compass under it; zoom buttons only on desktop.
- The map reopens where you left it.

### Added
- **My location** button: one tap analyses where you're standing (location is only
  requested when you press it).

## 2.5.0 — Brand redesign

### Changed
- Whole app restyled to the MycoField brand system: light Off White / Stone Beige surfaces,
  Forest Green structure, Signal Lime for active elements, Moss Green data, Warm Amber
  alerts, Sky Blue for calculated/cached labels.
- Typography: Montserrat Bold/ExtraBold headlines and numbers, Inter body, Inter Medium
  uppercase labels (Google Fonts, with system-font fallback offline).
- New header with the MycoField logo mark and wordmark; new app icons, favicon and
  apple-touch-icon generated from the logo (cleaned to the two brand greens).
- Forest Green bottom navigation with Signal Lime active pill; tabs relabelled
  Map · Conditions · History · Field notes.
- Brand components: pill buttons (Forest "View map →", Lime "Save", Stone secondary),
  pill tags, stat block with delta and gradient sparkline, "Why this score" as the brand
  conditions-card bars, tracker rows in the brand card style (score tile, kicker, chevron).
- White map overlays and markers (selected area in Forest Green).
- Score text colours meet contrast on light backgrounds; status is never colour-only.

### Fixed
- Exact-point marker was offset from the tapped point (a CSS rule overrode MapLibre's
  marker positioning). The map also re-pans once the full card has rendered so the point
  stays visible above it.

## 2.4.0 — Multi-area tracking and sub-areas

### Added
- **Signal is now a tracker for every area at once.** Each area shows its live index, trend
  arrow, 10-day index sparkline, 14-day rain and overnight low; sub-areas are nested under
  their parent. Sort by index or A–Z. Tap a row to see its full detail below.
- **Sub-areas**: tap or search a spot on the map → **Save area** → name it and choose
  "Sub-area of …" (nearest area pre-selected) or "New top-level area". Each gets its own
  weather, elevation, slope, aspect and index. Sub-area markers hide when zoomed out.
- **Editable areas**: rename or delete any area (including the four built-ins) from the
  Signal page. Deleting a parent also deletes its sub-areas; observations are always kept.
- Areas are stored on this device (`mycofield-areas-v1`); saved spots are private.
- Observations record the full label (e.g. "Merthyr Tydfil › North slope") and the area
  centre, so Analyse still works after an area is deleted.
- Strongest tracked area compares every area and sub-area.
- Areas load 4 at a time to keep weather API use polite as the list grows.

### Changed
- Exact Point card: Refresh and Close moved to icon buttons in the header; the actions row is
  now Use in field log + Save area.

## 2.3.0 — Place search

### Added
- Search button on the Map: find a town, landmark, UK postcode, postcode area (e.g. CF47)
  or raw coordinates (`51.83, -3.42`). Picking a result flies the map there and runs
  Exact Point Intelligence on it; the card shows the place name.
- Sources: postcodes.io for UK postcodes, OpenStreetMap Nominatim for everything else
  (search on submit only, max 1 request/second, results cached 7 days). Coordinates are
  parsed on the device. Search terms are sent to those services.
- Clear messages for no results, postcode not found, offline and service errors.

## 2.2.1

### Added
- Tap any coordinates (Exact Point card, attached-location panel, history records with a
  private point) to open that spot in Google Earth with a pin. On phones this opens the
  Google Earth app if it's installed. Opening the link shares those coordinates with Google.

## 2.2.0 — Exact Point Intelligence

Built on the static prototype (the only source available in this repo and on the live deployment).

### Added
- **Exact Point Intelligence**: tap anywhere on the map to analyse that exact point.
  - One pulsing exact-point marker (replaced on each tap), card with immediate loading state.
  - Live Open-Meteo weather: 14-day rainfall, latest overnight low, moisture persistence.
  - Open-Meteo Elevation: centre + N/S/E/W samples at 60 m in one batched request.
  - Calculated slope and aspect (downslope bearing; "Flat" below 2°).
  - Experimental Terrain Context (0–100) and Conditions Index with a score breakdown.
  - Actions: Use in field log, Refresh (bypasses cache), Close.
  - Partial results: weather and terrain each still show if the other fails.
  - Map pans so the analysed point stays visible above the card.
- **Live saved areas**: real weather + terrain for Merthyr, Blorenge, Pen y Fan, Bedlinog
  (replaces the seeded demo numbers). Markers on the map show each area's live index,
  the selected area and the strongest area.
- **Strongest tracked area** card; tap to fly there.
- **Signal** tab now live: index, trend (today vs next 3 days), 10-day outlook with rain and
  weather description, sparklines, and a "why this score" breakdown.
- **Field log**: "Private location attached" panel (coordinates, elevation, aspect, slope) with
  Remove location. Observations store private coordinates, terrain and an environmental
  snapshot with model version.
- **Historical Analyse** on every record: 7/14/30-day rain, 7-day average low, wet days,
  persistence and the Conditions Index on the day. Uses the Open-Meteo Archive, or the forecast
  API's past days for dates within the last week. Result is stored on the record.
- One shared scoring engine (`calculateConditionsIndex`) used by areas, points, snapshots and history.
- localStorage cache with TTLs: weather 1 h, terrain 30 days, archive permanent.
  LIVE / CACHED / OFFLINE / PARTIAL / ERROR labels and Retry.
- App icons (192/512), iOS home-screen meta tags.

### Changed
- Prototype weighting now matches the stated model: 40% rain, 30% nights, 20% persistence,
  10% terrain (the card previously showed 35/30/20/15 with seeded values).
- Records key is `mycofield-history-v2`; old `mycofield-history` records are migrated.
- Service worker: versioned cache (`mycofield-v2.2.0`), old caches deleted, `skipWaiting`,
  Open-Meteo requests bypass the SW cache.
- Toast instead of blocking `alert()` on save.

### Fixed
- History list never rendered (`history` resolved to `window.history`).
- Map controls/attribution overlapping the bottom cards.
