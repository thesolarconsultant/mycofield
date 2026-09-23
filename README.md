# MycoField working prototype

A static PWA prototype for general grassland-fungi habitat and phenology research.

## Working now
- Interactive 3D terrain map (MapLibre + OpenStreetMap)
- Merthyr, Blorenge, Pen y Fan/Bannau and Bedlinog sample areas
- 0–100 conditions dashboard
- 10-day sample trend display
- Local observation + blank logging
- Historical backtest UI concept
- Installable as a PWA when served over HTTPS/localhost

## Run locally
From this folder:

    python3 -m http.server 8000

Then open http://localhost:8000

## Production next
Connect a live forecast API, ERA5-Land / Met Office historical data, elevation/slope/land-cover analysis, authentication, private cloud storage, photos and a real model trained on both positive and blank observations.

The score values in this prototype are seeded demonstration data, not a live scientific model.
