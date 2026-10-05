# Gusev crater, Columbia Hills (Spirit) — HiRISE stereo DTM + RED ortho

Site band for Spirit.

| file                                    | product                                                                                | size          |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| `DTEEC_001513_1655_001777_1650_U01.tif` | MRO HiRISE controlled DTM, stereo pair PSP_001513_1655/PSP_001777_1650 (UA, SOCET SET) | 136,073,080 B |
| `PSP_001513_1655_RED_A_01_ORTHO.tif`    | RED ortho of the nadir member, 25 cm, on the same DTM                                  | 696,362,313 B |

Upstream (USGS analysis-ready bucket, STAC collection `mro_hirise_socet_dtms`):
<https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/PSP_001513_1655_PSP_001777_1650/>.
Both files are COGs as published. Fetched by hand 2026-09-15; the second ortho
(`PSP_001777_1650_…`) sits beside them unused. Licence CC0-1.0 (STAC).

## Grid

- Equirectangular, lat_ts 0, lon0 0, on the "Mars (2015) sphere" of
  3,396,190 m; edge-registered.
- DTM: 6597 × 10802, Float32 metres, 1.0149 m pixels, `NoData = -3.4028227e+38`.
  Bounds 175.442–175.555 E, −14.677 – −14.492.
- Ortho: 26389 × 43210, **UInt16 grey** (single RED band), 0.2537 m pixels,
  `NoData = 0`; same footprint. Colour comes from the Viking global band at
  bake time (colour-matched grey).
- **Vertical reference: the MOLA areoid** (HiRISE DTMs are controlled to MOLA
  topography). The +6,190 m rebase onto the scene datum is the bake's.

Worktrees reach both rasters through leaf symlinks to main's
`data/raw/hirise/gusev/`.
