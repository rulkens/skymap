# Viking MDIM 2.1 colour mosaic (Mars)

Global albedo source for Mars's surface-tile `albedo` product (z3–z7).

|          |                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Product  | Mars Viking Colorized Global Mosaic 232m v2 (USGS Astrogeology), `Mars_Viking_MDIM21_ClrMosaic_global_232m.tif` (12,742,411,029 B) |
| Upstream | <https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif> (302 → `asc-pds-services` S3)                 |
| Fetched  | 2026-09-15, by hand (no fetcher)                                                                                                   |
| Baked    | `Mars_Viking_MDIM21_ClrMosaic_global_232m_cog.tif` (1,315,920,588 B), converted 2026-09-17                                         |
| Licence  | Public domain (US government work). Cite: USGS Astrogeology Science Center, _Mars Viking Colorized Global Mosaic 232m v2_ (2014).  |

## Grid

- 92160 × 46080, three Byte bands (RGB). `NoData = 0` on every band.
- Equirectangular ("SimpleCylindrical"), lat_ts 0, lon0 0, on a
  **3,396,190 m sphere**; pixel-edge registered, 231.5418 m pixels, outer edges
  exactly ±180°, ±90°.
- Imagery only, so no vertical reference applies.

## COG conversion

The upstream file is strip-organised: a 512² window read took ~14 s against
~9 ms on a tiled COG. The bake reads the COG:

```sh
gdal_translate -of COG -co COMPRESS=JPEG -co QUALITY=95 -co OVERVIEWS=NONE -co BIGTIFF=YES \
  Mars_Viking_MDIM21_ClrMosaic_global_232m.tif Mars_Viking_MDIM21_ClrMosaic_global_232m_cog.tif
```

GDAL writes it as YCbCr JPEG, 512² blocks. JPEG is lossy, so a pixel that was
exactly 0 upstream may decode as a small non-zero value; the mosaic is global,
so no-data only matters at the poles' fill.

## Overviews (added 2026-09-18, 1,566,903,882 B)

`OVERVIEWS=NONE` above only holds for the bake's own deep-tile reads. Any wide
box — the albedo bench zoomed out, a whole-planet preview — decodes the whole
92160×46080 raster without a pyramid, which `geoTiffImagerySource` now avoids by
reading the coarsest level that still covers the output (whole planet: 24 s → 50 ms).
The seven levels were appended in place, leaving the full-resolution pixels
untouched (no second JPEG generation):

```sh
gdaladdo -oo IGNORE_COG_LAYOUT_BREAK=YES -r average \
  --config COMPRESS_OVERVIEW JPEG --config PHOTOMETRIC_OVERVIEW YCBCR \
  --config JPEG_QUALITY_OVERVIEW 85 \
  Mars_Viking_MDIM21_ClrMosaic_global_232m_cog.tif 2 4 8 16 32 64 128
```

`IGNORE_COG_LAYOUT_BREAK` is needed because appending IFDs breaks the strict COG
byte order; the file is read from local disk, never by HTTP range request, so the
layout guarantee buys nothing here. Re-running the `gdal_translate` above alone
would silently drop the pyramid and take wide reads back to minutes.

Worktrees reach the file through a leaf symlink to main's `data/raw/viking/`.
