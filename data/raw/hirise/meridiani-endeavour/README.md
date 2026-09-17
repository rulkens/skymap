# Meridiani Planum, Endeavour crater rim (Opportunity) — HiRISE stereo DTM + RED ortho

Site band for Opportunity's final position (Perseverance Valley).

| file                                    | product                                                                                | size            |
| --------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| `DTEEC_018701_1775_018846_1775_U01.tif` | MRO HiRISE controlled DTM, stereo pair ESP_018701_1775/ESP_018846_1775 (UA, SOCET SET) | 248,267,403 B   |
| `ESP_018701_1775_RED_A_01_ORTHO.tif`    | RED ortho of the nadir member, 25 cm, on the same DTM                                  | 1,590,557,975 B |

Upstream (USGS analysis-ready bucket, STAC collection `mro_hirise_socet_dtms`):
<https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_018701_1775_ESP_018846_1775/>.
Both files are COGs as published. Fetched by hand 2026-09-15; the second ortho
(`ESP_018846_1775_…`) sits beside them unused. Licence CC0-1.0 (STAC).

## Grid

- Equirectangular, lat_ts 0, lon0 0, on the "Mars (2015) sphere" of
  3,396,190 m; edge-registered.
- DTM: 7854 × 21470, Float32 metres, 1.0118 m pixels, `NoData = -3.4028227e+38`.
  Bounds −5.445 – −5.311 E (354.555–354.689 E), −2.491 – −2.125.
- Ortho: 31414 × 85880, **UInt16 grey** (single RED band), 0.2530 m pixels,
  `NoData = 0`; same footprint. It carries an `Offset 0.05504 / Scale 0.000206`
  tag (DN → I/F); the bake stretches raw DNs and ignores it. Colour comes from
  the Viking global band (colour-matched grey).
- **Vertical reference: the MOLA areoid.** The +6,190 m rebase onto the scene
  datum is the bake's.

The Eagle-crater landing pair in `../meridiani-landing/` is not baked (plan
ruling R1: Opportunity sits at its final position, inside this box).

Worktrees reach both rasters through leaf symlinks to main's
`data/raw/hirise/meridiani-endeavour/`.
