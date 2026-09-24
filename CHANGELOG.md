# Changelog

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
