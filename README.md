# MycoField

Environmental intelligence for general grassland-fungi habitat and phenology research.
A static, installable PWA: `index.html` + `sw.js` + `manifest.webmanifest`. No build step, no framework.

## Features
- **Map**: MapLibre 3D terrain over OpenStreetMap, 3D/flat toggle, four tracked research areas
  with live Conditions Index markers and a strongest-area card.
- **Exact Point Intelligence**: tap any point for live weather, elevation, slope, aspect,
  experimental Terrain Context and Conditions Index. Send it to the field log as a private location.
- **Signal**: live index, trend, 10-day outlook, sparklines and a score breakdown.
- **History**: observation log (positives *and* blanks) with Analyse, which rebuilds the
  30 days of weather before each record.
- **Log**: field observations with optional private coordinates and an environmental snapshot.

## Data sources
| Data | Source |
| --- | --- |
| Forecast + recent weather | Open-Meteo Forecast API (`past_days=14`, `forecast_days=10`) |
| Historical weather | Open-Meteo Archive API (Forecast API past days for the last week) |
| Elevation | Open-Meteo Elevation API (Copernicus DEM, ~90 m) |
| Map / terrain | OpenStreetMap tiles, MapLibre demo terrain DEM |

## Model (experimental, `conditions-v0.2`)
```
rainScore = clamp(rain14 / 45 * 100)
lowScore  = clamp(100 - |low - 8| * 12)
persistence: m = clamp(m * 0.80 + min(dailyRain, 12) / 18, 0, 1)
index = 0.40 rain + 0.30 low + 0.20 persistence + 0.10 terrain
```
Terrain Context is a hand-built heuristic (elevation 45%, slope 35%, aspect 20%) in
`calculateTerrainScore()`. Nothing here is scientifically validated. The index is not a probability.

## Privacy
Observations and any attached coordinates are stored only in this browser's localStorage
(`mycofield-history-v2`). Nothing is uploaded.

## Run locally
    python3 -m http.server 8000
Then open http://localhost:8000

## Releasing
Bump `CACHE` in `sw.js` and `VERSION` with each release so installed PWAs pick up the new build.
