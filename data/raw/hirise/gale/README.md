# Gale crater (Curiosity) — HiRISE DTM + colour ortho

Site band for Curiosity.

| file                                         | product                                                                     | upstream size   |
| -------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| `MSL_Gale_DEM_Mosaic_1m_v3.tif`              | MSL Gale Merged DEM 1m v3 (USGS Astrogeology)                               | 3,868,256,546 B |
| `MSL_Gale_DEM_Mosaic_1m_v3_cog.tif` (baked)  | COG of the above, converted 2026-09-17                                      | 1,218,792,188 B |
| `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` | HiRISE 78-quad colour basemap, Parker & Calef (JPL), JPEG-YCbCr COG (baked) | 1,030,625,379 B |

Upstream: <https://planetarymaps.usgs.gov/mosaic/Mars/MSL/> (both files; the
bucket also holds a 7.6 GB uncompressed DEM under `mosaic/` — not the one
here). Fetched by hand 2026-09-15. Public domain (US government work).

## DTM

- 32980 × 57440, Float32 metres, `NoData = -32767`, LZW strips upstream.
- Equirectangular, lat_ts 0, lon0 0, on the 3,396,190 m IAU sphere; 1 m
  pixels, edge-registered; bounds 137.124–137.681 E, −5.099 – −4.130.
- **Vertical reference: the MOLA areoid**, like the MOLA DEM it was
  controlled to. The +6,190 m rebase onto the scene datum is the bake's; the
  bake's datum check (median DTM − MOLA per site) guards the assumption.

```sh
gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=3 -co OVERVIEWS=NONE -co BIGTIFF=YES \
  MSL_Gale_DEM_Mosaic_1m_v3.tif MSL_Gale_DEM_Mosaic_1m_v3_cog.tif
```

## Ortho

- 36000 × 76000, RGB Byte, 0.25 m, 512² tiles; no-data is the per-dataset
  mask, not a value. Same sphere and projection; bounds 137.327–137.479 E,
  −4.876 – −4.555.
- Upstream note (`.txt` sidecar): several HiRISE RGB strips georectified by
  hand, blended and fused to the MSL HiRISE RED orthomosaic, lightly sharpened
  (GIMP unsharp mask), then converted to a JPEG COG by USGS.

Worktrees reach both rasters through leaf symlinks to main's
`data/raw/hirise/gale/`.
