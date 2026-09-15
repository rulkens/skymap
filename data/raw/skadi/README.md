# skadi 1″ elevation cells

Deep height source under the EOX s2cloudless imagery bands.

|          |                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout   | `<N55>/<N55E012>.hgt`, one file per 1°×1° cell, 25,934,402 B each                                                                                                                                                   |
| Upstream | `https://elevation-tiles-prod.s3.amazonaws.com/skadi/<N55>/<N55E012>.hgt.gz`                                                                                                                                        |
| Fetched  | 2026-09-15 (`npm run fetch-height -- --skadi`)                                                                                                                                                                      |
| Licence  | Public-domain and open national sources (NASA SRTM v3, USGS NED/3DEP, Canada CDEM and others) redistributed by the AWS Open Data programme; see <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>. |

## Why `skadi` and not `terrarium`

The same bucket serves `terrarium` PNGs, which are **WebMercator** and would
need reprojecting onto the equirectangular lattice. `skadi` is SRTM-format and
**geographic** — the lattice samples it directly.

## Byte layout

3601 × 3601 **big-endian** int16 metres, row-major, row 0 = the cell's NORTH
edge, column 0 = its WEST edge. Read little-endian, −7 m decodes as −1537 m and
the terrain looks like noise, which is what
`tests/tools/textures/skadiHeightSource.test.ts` pins.

`-32768` is the void sentinel → NaN → the band's underfill.

## Cell naming and shared edges

A cell is named by its **south-west** corner, zero-padded `N55E012` /
`S06W072`. Adjacent cells duplicate the shared row or column, so a post on a
whole-degree parallel or meridian lives in two files. `skadiCellsForBounds`
and `skadiHeightSource` both resolve it by `floor`, so the reader can never
want a cell the fetcher had no reason to pull — at the cost of pulling one
extra cell per box edge that lands exactly on a whole degree.

## Coverage

The cell set is derived from `EOX_REGIONS` (`tools/fetch/eoxRegions.ts`), not
listed here: widening a region widens the harvest with no edit in this file.
