# ETOPO 2022 30″ global relief

Global height source for the surface-tile pyramid's `height` product.

| | |
| --- | --- |
| File | `ETOPO_2022_v1_30s_N90W180_surface.tif` (1,585,813,987 B) |
| Upstream | <https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/30s/30s_surface_elev_gtif/ETOPO_2022_v1_30s_N90W180_surface.tif> |
| Fetched | 2026-09-15 (`npm run fetch-height -- --etopo`) |
| Licence | Public domain (US government work). Cite: NOAA National Centers for Environmental Information, *ETOPO 2022 15 Arc-Second Global Relief Model*, DOI [10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74). |

The thredds path quoted in the terrain spec 404s; the NGDC path above is the
one that answered 200.

## Grid

43200 × 21600, one float32 band, DEFLATE with a horizontal predictor, 256²
blocks — so a window read is cheap and the 3.7 GB uncompressed raster is never
resident.

- CRS `EPSG:9518` (WGS 84 + EGM2008 height): **orthometric metres**, not
  ellipsoidal. R10 of the F1 plan uses them as sphere-relative as they are.
- `AREA_OR_POINT=Area`, `node_offset=1`: **cell registration**. A pixel's value
  belongs at its CENTRE, `lon = −180 + (col + 0.5)/120`. Dropping the half-cell
  shifts every coastline 460 m.
- `NoData = -99999` — decoded to NaN, never sampled as a −99 km pit.
- Surface elevation, so bathymetry is real depth. It is *not* clamped in the
  source: the bake flattens water bodies once it has the whole level grid,
  which is what lets an enclosed basin keep its own level (R3).

## Related products

The same release ships `bed` (ice-bottom) and 15″ variants. The 30″ surface
grid is the one the global band bakes from; a 15″ swap would be a registry
path edit plus a `maxLevel` bump in `etopoHeightSource.ts`.
