# DHM/Terræn 0.4 m DTM — Søndermarken

Deepest height source, under the GeoDanmark z19 orthophoto band.

|          |                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------- |
| Layout   | `DTM_1km_<northingKm>_<eastingKm>.tif`, one file per 1 km DDKN cell, ~13 MB each                    |
| Endpoint | `https://api.datafordeler.dk/FileDownloads/GetRasterFile?FileName=DTM_1km_<n>_<e>.tif&apiKey=<key>` |
| Fetched  | 2026-09-15 (`npm run fetch-height -- --dhm-terraen`)                                                |
| Licence  | Frie data — © Klimadatastyrelsen, via Datafordeler.                                                 |

**Not `data/raw/dhm/`.** That is the DHM _Punktsky_ LAS point cloud for the
scene-workbench splat bake, from a different endpoint
(`GetPointCloudFile`) and a different product. This is the gridded terrain
model.

## Grid

2500 × 2500 float32 metres above **DVR90**, `EPSG:25832` (UTM zone 32N,
GRS80), 0.4 m pixels, `AREA_OR_POINT=Area`, `NoData = -9999`, DEFLATE.
Tile `DTM_1km_6175_721` has its origin at E 721000 / N 6176000 — the name is
the **south-west** corner in kilometres, so the northing in the name is one
kilometre below the raster's origin.

The height lattice is in degrees, so every post is projected to UTM32
(`tools/utils/geo/lonLatToUtm32.ts`) before it is sampled; the tiles are never
warped. Posts the harvest does not cover come out NaN and fall back to
`skadi` (`voidFilledHeightSource`).

## Tile set

Derived, not listed: the fetcher takes the GeoDanmark albedo band's z14 tile
rect (`x[8761..8763] y[1562]`, i.e. the z19 harvest rect in
`data/raw/geodanmark/README.md` divided by 32), projects all four corners —
the box's UTM image is a rotated quadrilateral, so two corners are not enough
— and enumerates the kilometre cells between them.

## API key

Same key as the GeoDanmark ortho and Punktsky harvests: login-keychain item
`skymap-datafordeler-apikey`, read in-process, never printed and never placed
in a logged URL. A freshly created key returns 401 for up to ~20 minutes per
gateway node.

The response's `content-type` claims zip and is wrong — the bytes are a plain
GeoTIFF starting `II*`.
