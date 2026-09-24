# MycoField

Environmental intelligence for general grassland-fungi habitat and phenology research.
A static, installable PWA: `index.html` + `sw.js` + `manifest.webmanifest`. No build step, no framework.

## Features
- **Map**: MapLibre 3D terrain over OpenStreetMap, 3D/flat toggle, four tracked research areas
  with live Conditions Index markers and a strongest-area card.
- **Exact Point Intelligence**: tap any point for live weather, elevation, slope, aspect,
  experimental Terrain Context and Conditions Index. Coordinates open in Google Earth.
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
| Habitat | OpenStreetMap land use via Overpass, refined in Wales by NRW LANDMAP survey habitat (or set in the field) |
| Land & grazing (Wales) | Natural Resources Wales LANDMAP land management (stock grazing etc.), grassland-fungi potential habitat and open-access land, via DataMapWales |
| Place search | OpenStreetMap Nominatim; UK postcodes via postcodes.io |
| Map / terrain | OpenStreetMap tiles, MapLibre demo terrain DEM |

## Model (experimental, `conditions-v0.4`)
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
