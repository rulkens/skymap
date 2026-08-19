# EOX s2cloudless — WMTS z13 tile harvest

| Field        | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Layer        | `s2cloudless`, **2016 edition only**                                                 |
| Licence      | CC BY 4.0 — [EOX Maps terms](https://maps.eox.at/#data)                              |
| Upstream URL | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/{z}/{row}/{col}.jpg` |
| Grid         | WGS84 TMS — `columns(z) = 2^(z+1)`, `rows(z) = 2^z`, 256px tiles                     |
| Fetch date   | Harvested per region, on demand — see the run log for each patch                     |

## Layer year — hard constraint

Only the **2016** `s2cloudless` layer is CC BY 4.0. The 2018+ layer is
CC BY-NC-SA (ShareAlike would contaminate this JOSS-bound repo — rejected
outright, not a tradeoff), and the 2017 layer is broken upstream. The layer
name is hardcoded in `tools/fetch/fetchEoxTiles.ts`; there is no CLI flag to
select a different one.

## Tile-index convention

The URL path is **`{z}/{row}/{col}`** — row before column. Most XYZ/slippy
tile schemes go col-then-row, so this ordering is easy to get backwards; it
is load-bearing for every request this fetcher makes.

The WGS84 TMS grid is the same ladder as skymap's own `earthTileColumns`
(`src/utils/scene/earthTileColumns.ts`, `(512 << z) / tilePx` at
`tilePx = 256`): `earthTileColumns(13, 256) === 16384 === 2^14`, matching
`columns(13) = 2^(13+1)`. z13 tiles from this harvest composite straight into
skymap's own bake pyramid with no re-numbering.

## z13 only

This harvest fetches **z13 tiles only** — coarser levels (z8-z12) are derived
at bake time by the existing 2x2 average, exactly as BMNG's deepest level is
today. Local tile files land at `data/raw/eox/<z>/<row>/<col>.jpg` (currently
always `<z> = 13`).

## How to obtain

```
npm run fetch-eox -- <west> <south> <east> <north> [--level 13]
```

Sequential, throttled to ~2 requests/second, with exponential backoff on
retryable failures (429/503/5xx or a network error) — same backoff shape as
`tools/fetch/fetchDesi.ts`. Resumable by tile-file existence: re-running the
same bbox/level skips every tile already on disk, no separate chunk-state
sidecar (a tile is atomically whole-or-absent). A non-image response (a
throttled EOX origin serving an HTML page instead of a JPEG) throws and stops
the run rather than writing HTML bytes into the tile tree under a `.jpg`
name.
