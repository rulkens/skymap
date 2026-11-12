# LOLA 118 m global DEM (Moon)

Global height source for the Moon's surface-tile `height` product (z3–z7), and
the terrain the WAC albedo is de-lit against.

|          |                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Product  | Lunar LRO LOLA Global LDEM 118m (USGS Astrogeology), `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` (8,494,203,833 B)     |
| Upstream | <https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif>                                      |
| Fetched  | 2026-11-11, by hand (no fetcher)                                                                                        |
| Baked    | `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014_cog.tif` (3,681,705,749 B), converted 2026-11-11                               |
| Licence  | Public domain. Cite: Smith et al., NASA/GSFC LOLA team; USGS Astrogeology Science Center.                               |

## Grid

- Upstream: 92160 × 46080, one Int16 band with `Scale = 0.5` (half-metres),
  `NoData = -32768`. The COG holds Float32 metres (`-unscale`; spot check:
  DN −1441 → −720.5 m). Measured range (`gdalinfo -mm` on the COG,
  2026-11-11): **−9,128.5 … +10,781.5 m**.
- Equirectangular, lat_ts 0, lon0 0, on a **1,737,400 m sphere**; pixel-edge
  registered, 118.4505876 m pixels, outer edges exactly ±180°, ±90°.
- **Vertical reference: the 1,737,400 m sphere.** The scene's Moon is
  1,737,000 m, so the bake adds +400 m; that rebase is the bake's, not this
  file's.

## COG conversion

The upstream file is strip-organised, and sharp loads a signed 16-bit TIFF as
`grey16` with every negative sample clamped to 0, so the bake reads a tiled
Float32 COG with the 0.5 m scale already applied. The original was deleted
after conversion (owner ruling 2026-11-11); re-fetch it from the URL above to
redo this:

```sh
gdal_translate -of COG -unscale -ot Float32 -co BLOCKSIZE=512 -co OVERVIEWS=NONE -co COMPRESS=DEFLATE -co PREDICTOR=3 -co NUM_THREADS=ALL_CPUS \
  Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014_cog.tif
```

Worktrees reach the file through a leaf symlink to main's `data/raw/lola/`.
