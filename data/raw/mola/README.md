# MOLA 463 m global DEM (Mars)

Global height source for Mars's surface-tile `height` product (z3–z7).

|          |                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Product  | Mars MGS MOLA DEM 463m v2 (USGS Astrogeology), `Mars_MGS_MOLA_DEM_mosaic_global_463m.tif` (2,125,771,142 B)                             |
| Upstream | <https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif> (302 → `asc-pds-services` S3)                          |
| Fetched  | 2026-09-15, by hand (no fetcher)                                                                                                        |
| Baked    | `Mars_MGS_MOLA_DEM_mosaic_global_463m_cog.tif` (662,268,513 B), converted 2026-09-17                                                    |
| Licence  | Public domain (US government work). Cite: Fergason, Hare & Laura (2018), _Mars MGS MOLA DEM 463m v2_, USGS Astrogeology Science Center. |

## Grid

- 46080 × 23040, one Int16 band, metres. `NoData = -32768`. Measured range
  (`gdalinfo -mm` on the COG, 2026-09-17): **−8,201 … +21,241 m**.
- Equirectangular, lat_ts 0, lon0 0, on a **3,396,190 m sphere**: `lon = x/R`,
  `lat = y/R`. Pixel-edge registered, 463.0935 m pixels; the outer edges sit
  at ±180°, ±90° (to within 7″ of rounding in the header).
- **Vertical reference: the MOLA areoid**, not the sphere. The bake treats the
  heights as relative to the 3,396,190 m sphere and adds
  `MARS_IAU_SPHERE_RADIUS_M − datumRadiusM` (+6,190 m) to land them on the
  scene's 3,390 km datum; that rebase is the bake's, not this file's.

## COG conversion

The upstream file is strip-organised (one 46080-px strip per row), so every
window read decodes whole rows. The bake reads a tiled COG instead:

```sh
gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=2 -co OVERVIEWS=NONE -co BIGTIFF=YES \
  Mars_MGS_MOLA_DEM_mosaic_global_463m.tif Mars_MGS_MOLA_DEM_mosaic_global_463m_cog.tif
```

Worktrees reach the file through a leaf symlink to main's `data/raw/mola/`.
