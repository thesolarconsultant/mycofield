# Changelog

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
