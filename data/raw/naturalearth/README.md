# Natural Earth 1:10m rivers

Rivers of the antique Earth map (`npm run build-antique-earth` →
`public/antique/earth-1690.bin`).

|          |                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Files    | `ne_10m_rivers_lake_centerlines.geojson` (7,307,743 B), `ne_10m_rivers_europe.geojson` (2,534,505 B) |
| Upstream | <https://github.com/nvkelso/natural-earth-vector>, tag `v5.1.2`, commit `f1890d9f152c896d250a77557a5751a93d494776`, directory `geojson/` |
| Fetched  | 2026-11-07 (`npm run fetch-natural-earth`)                                                            |
| Checksum | `naturalearth.sha256` beside this file                                                                |
| Licence  | Public domain. <https://www.naturalearthdata.com/about/terms-of-use/>: "All versions of Natural Earth raster + vector map data found on this website are in the public domain." |

The repository's GeoJSON is the same data as the shapefile zips on
naturalearthdata.com, so the tool reads JSON and needs no shapefile parser.
The URL is pinned to a commit, so a checksum mismatch is a broken transfer.

## Fields the bake reads

- `featurecla`: `River`, `Lake Centerline`, `Intermittent River` (Europe only).
  The world layer at this commit has no `Canal` class; canals are dropped by name.
- `scalerank`: 0–10 in the world layer, 10–12 in the European one; the line width.
- `min_zoom`: the web-map zoom a feature appears at; the reveal level.
- `rivernum` (or `name` when it is 0 or empty): which pieces belong to one river.
- Geometry: `LineString` or `MultiLineString`, lon/lat degrees (WGS 84).
  The bake orients each river by ETOPO elevation rather than trusting the
  digitising direction.
