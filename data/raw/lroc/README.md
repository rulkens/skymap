# LROC WAC 100 m global mosaic (Moon)

Global albedo source for the Moon's surface-tile `albedo` product (z3–z7).

|          |                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Product  | Lunar LRO LROC WAC Global Morphologic Mosaic 100m (USGS Astrogeology), `Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif` (5,959,263,751 B) |
| Upstream | <https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif>                                        |
| Fetched  | 2026-11-11, by hand (no fetcher)                                                                                                 |
| Baked    | `Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013_cog.tif` (1,578,655,534 B), converted 2026-11-11                                 |
| Licence  | Public domain. Cite: Speyerer et al., _LROC WAC global morphologic mosaic_, NASA/GSFC/Arizona State University.                  |

## Grid

- 109164 × 54582, one Byte band (grey). `NoData = 0`. The header's
  `Offset = −0.00395`, `Scale = 1.00395` are radiometric; the bake ignores them
  and reads raw DNs.
- Equirectangular, lat_ts 0, lon0 0, on a **1,737,400 m sphere**; pixel-edge
  registered, exactly 100 m pixels, origin (−5458203.0763, 2729101.5382) =
  (−πR, πR/2). The west and north edges sit at −180°, +90°; the east and south
  edges fall 6 m and 3 m short of +180°, −90° (under a tenth of a pixel).
- Imagery only, so no vertical reference applies.

## Lighting

A "morphologic" mosaic: every frame was shot at 55–75° incidence to bring out
relief, so the shading is baked in. Crops at four longitudes (2026-11-11) all
show the Sun from the west, which is what lets the bake de-light it against one
fixed photo Sun. Above ~65° latitude the shadows are hard and cast, with no
detail left under them to recover.

## COG conversion

The upstream file is strip-organised, so every window read decodes whole rows.
The bake reads a tiled COG; the original was deleted after conversion (owner
ruling 2026-11-11), so re-fetch it from the URL above to redo this:

```sh
gdal_translate -of COG -co BLOCKSIZE=512 -co OVERVIEWS=NONE -co COMPRESS=JPEG -co QUALITY=95 -co NUM_THREADS=ALL_CPUS \
  Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013_cog.tif
```

JPEG is lossy, so a pixel that was exactly 0 upstream may decode as a small
non-zero value; the mosaic is global, so that only matters at polar fill.

Worktrees reach the file through a leaf symlink to main's `data/raw/lroc/`.
