# MycoField Conditions Index — methodology (conditions-v0.5)

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
| Habitat | OpenStreetMap land-use/natural tags via Overpass `is_in`, refined by official habitat data in Wales, England and Scotland (see below); or set by the user in the field | OSM mapping is uneven; official surveys vary in scale and age; unmapped = unknown | 10% | Semi-natural grassland 100, amenity grass 70, heath/moor 60, farmland 55, scrub 35, wetland 35, improved grassland 30, woodland 25, arable 10, bare 10, built-up 10, water 0 |
| Frost | Calculated: nights ≤ 0 °C in the last 7 days | Model grid | penalty | −5 per frost night, max −15 |

## Land & grazing (Great Britain)
Each point is checked against official open habitat data for its nation (point-in-polygon
queries, cached 180 days). In border areas every candidate nation is queried and the one whose
national layers contain the point is used.

| Nation | Layers | Grazing? |
|---|---|---|
| Wales | NRW **LANDMAP Landscape Habitats** (surveyed habitat + recorded land management), NRW **potential habitat for grassland fungi**, open-access (CRoW) land — DataMapWales WFS | **Yes** — "stock grazing" in the surveyed management |
| England | Natural England **Priority Habitat Inventory** (mapped semi-natural habitat), RPA **Crop Map of England 2023** (grass vs crop per field), Natural England **Living England** (satellite habitat model), **registered common land** — ArcGIS feature services | No public data |
| Scotland | NatureScot **Habitat Map of Scotland** (EUNIS/NVC surveys; patchy coverage) | No public data |

How it is used:
- **Habitat.** The official habitat replaces broad OpenStreetMap land use (farmland, grassland,
  heath, or nothing mapped), because it separates *improved* grassland (fertilised, reseeded;
  scores 30) and arable (10) from *semi-natural* grassland (100). Specific, more local OSM cover
  (a mapped wood, lake, building or lawn) still wins.
  - Wales: LANDMAP habitat ("Mosaic" areas use their first listed habitat).
  - England, in order: Priority Habitat Inventory main habitat → Crop Map crop (arable) or sown
    ryegrass ley (improved) → Living England "Improved Grassland" at ≥50% model confidence.
    Grass that is on none of these is left to OpenStreetMap: absence from the inventory is not
    proof of improvement.
  - Scotland: the habitat with the largest share of the mapped polygon, classed by EUNIS code
    (E2.6 / ryegrass = improved, other E = semi-natural grassland, D/E3 = wetland, F4 = heath…).
- **Grazing is not scored.** In Wales it is shown and stored ("recorded" / "not recorded").
  Everywhere, the Field notes form records grazing you observe (stock now / this year / ungrazed /
  mown, and the animal). Evidence compares both, plus the Wales fungi zone and England's
  grass-vs-crop, between finds and blanks. They only enter the score if the evidence supports it.
- Survey data is landscape- or field-scale and often years old (LANDMAP 2000–2017, many
  Scottish surveys 1990s): it says how land is or was managed, not what is in a field today.

Contains Natural Resources Wales information © Natural Resources Wales and database right;
© Natural England; © Rural Payments Agency; © NatureScot. All under the Open Government Licence.

## Missing data
Missing inputs are **not** filled in. Their weight is shared proportionally across the inputs
that are available, and every result reports its completeness (e.g. "90% of inputs · missing
habitat"). A field-set habitat always overrides the mapped one.

## Resolution limits
- Weather and soil moisture come from gridded models. Every spot inside one grid square gets
  identical weather; the app reports the distance to the grid point used and flags sub-areas
  that share their parent's cell. Differences between such spots come only from terrain and
  habitat (together 20% of the index).
- Official habitat data varies from field-scale (England crop map) to landscape-scale (LANDMAP, often several km²); grazing data exists for Wales only.
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
  This includes yes/no factors — grazing from your field log, NRW-recorded stock grazing and
  fungi-potential zone (Wales), and grass-vs-crop 2023 (England) — shown as the share of finds and
  of blanks where they apply.
- Treat anything under ~10 finds and 10 blanks as provisional. Thresholds and weights should be
  re-set from real records once there are roughly 30+ of each, and the model version bumped.

## Sources
Open-Meteo Forecast, Historical (ERA5) and Elevation APIs; Copernicus DEM GLO-90;
OpenStreetMap contributors via the Overpass API.


## Live ready-ground overlay
The map overlay scores a grid of squares (about 11 × 11 km when zoomed in, coarser when zoomed out)
from live weather only: the rain, soil-moisture, water-balance, cool-nights and frost inputs of the
Conditions Index, with terrain and habitat left out and the weights renormalised as usual. Squares
under 45 aren't drawn. It shows where the weather is right, not whether the ground is suitable;
tap any spot for the full reading with terrain and habitat.
