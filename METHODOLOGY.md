# MycoField Conditions Index — methodology (conditions-v0.4)

The Conditions Index is an **experimental** 0–100 summary of whether recent environmental
conditions look favourable for grassland fungi in general. It is not a probability, it does
not predict any species, and none of its thresholds have been calibrated yet. This document
says exactly what goes in, where it comes from, how precise it is, and how to test it.

## Inputs

| Input | Source | Resolution / notes | Weight | Sub-score (0–100) |
|---|---|---|---|---|
| Rainfall, 14 days | Open-Meteo forecast (daily precipitation) | Weather-model grid, a few km | 25% | `rain14 / 45 mm × 100`, capped |
| Soil moisture, 3–27 cm | Open-Meteo land-surface model (hourly volumetric water content, averaged per day) | Model grid, a few km; archive uses ERA5-Land-type bands 0–7 / 7–28 cm | 20% | 0.15 m³/m³ → 0, 0.40 m³/m³ → 100, linear |
| Water balance | Calculated: 50 mm bucket, `store = store + rain − ET₀` (FAO-56 reference evapotranspiration from Open-Meteo) | 30 days of spin-up before "today"; 45 days for history | 15% | `store / 50 mm × 100`. Falls back to the v0.2 moisture-memory decay if ET₀ is missing |
| Cool nights | Calculated: mean of the last 7 daily minimum temperatures | Model grid | 20% | `100 − |mean − 8 °C| × 12`, clamped |
| Terrain context | Open-Meteo Elevation (Copernicus DEM, 90 m); slope/aspect from 5 samples 60 m apart | 90 m — small banks/hollows invisible | 10% | Heuristic: elevation 150–600 m, slope 2–15°, N/NE/NW aspects favoured |
| Habitat | OpenStreetMap land-use/natural tags via Overpass `is_in`; in Wales refined by Natural Resources Wales LANDMAP Landscape Habitats (see below); or set by the user in the field | OSM mapping is uneven; LANDMAP is landscape-scale; unmapped = unknown | 10% | Semi-natural grassland 100, amenity grass 70, heath/moor 60, farmland 55, scrub 35, wetland 35, improved grassland 30, woodland 25, arable 10, bare 10, built-up 10, water 0 |
| Frost | Calculated: nights ≤ 0 °C in the last 7 days | Model grid | penalty | −5 per frost night, max −15 |

## Land & grazing (Wales only)
Each point in Wales is checked against three Natural Resources Wales layers on DataMapWales
(WFS point-in-polygon queries, cached 180 days):

- **LANDMAP Landscape Habitats**: the surveyed dominant habitat of the landscape area (Phase 1
  habitat survey, aerial photography, field verification) and its recorded **land management**
  (stock grazing, mowing, cultivation, burning…).
- **Potential habitat for grassland fungi** (NRW Green Infrastructure layer).
- **Open-access (CRoW) land.**

How it is used:
- **Habitat.** LANDMAP's habitat replaces broad OpenStreetMap land use (farmland, grassland,
  heath, or nothing mapped), because it separates *improved* grassland (fertilised, reseeded;
  scores 30) from *semi-natural* acid, neutral and calcareous grassland (scores 100). "Mosaic"
  areas use their first listed habitat. Specific, more local OSM cover (a mapped wood, lake,
  building or lawn) still wins over the landscape-scale survey.
- **Grazing is not scored.** It is shown on the point sheet and stored with every find and blank
  ("recorded" / "not recorded" / unknown), and Evidence compares it between finds and blanks.
  LANDMAP areas are often several km² and were surveyed 2000–2017, so it describes how an area is
  managed, not whether stock are in a particular field this year. It will only enter the score if
  the Evidence shows it separates finds from blanks.

Contains Natural Resources Wales information © Natural Resources Wales and database right
(Open Government Licence).

## Missing data
Missing inputs are **not** filled in. Their weight is shared proportionally across the inputs
that are available, and every result reports its completeness (e.g. "90% of inputs · missing
habitat"). A field-set habitat always overrides the mapped one.

## Resolution limits
- Weather and soil moisture come from gridded models. Every spot inside one grid square gets
  identical weather; the app reports the distance to the grid point used and flags sub-areas
  that share their parent's cell. Differences between such spots come only from terrain and
  habitat (together 20% of the index).
- LANDMAP habitat and grazing are landscape-scale (often several km²); Wales only.
- The historical archive is coarser (roughly 10–25 km).
- Terrain is from a 90 m elevation model.

## Record keeping
Each observation stores the environmental snapshot at the time of logging, including the model
version, completeness, weather grid cell and habitat source. Historical rewinds store their own
model version, so later model changes never silently rewrite old results.

## Validation
History → Evidence rebuilds every record under the current model and compares finds with blanks:
- **AUC** (Mann–Whitney): the chance a random find scored higher than a random blank.
  0.5 = no better than chance; distance from 0.5 is the strength; below 0.5 means the index
  points the wrong way.
- The same comparison is shown for each input, which shows which inputs actually carry signal.
  This includes two yes/no factors from the NRW data — stock grazing recorded and inside the
  grassland-fungi potential zone — shown as the share of finds and of blanks where they apply.
- Treat anything under ~10 finds and 10 blanks as provisional. Thresholds and weights should be
  re-set from real records once there are roughly 30+ of each, and the model version bumped.

## Sources
Open-Meteo Forecast, Historical (ERA5) and Elevation APIs; Copernicus DEM GLO-90;
OpenStreetMap contributors via the Overpass API.
