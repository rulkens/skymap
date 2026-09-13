# EOX s2cloudless — WMTS z13 tile harvest

| Field        | Value                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- |
| Layer        | `s2cloudless-2025`                                                                        |
| Licence      | CC BY-NC-SA 4.0 upstream — used with written permission from EOX (see below)              |
| Upstream URL | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{row}/{col}.jpg` |
| Grid         | WGS84 TMS — `columns(z) = 2^(z+1)`, `rows(z) = 2^z`, 256px tiles                          |

## Harvested regions

Bboxes are no longer recorded here — `tools/fetch/eoxRegions.ts` is the
single source of truth for every region name → bbox. This table only records
what has actually been harvested and when, one row per `npm run fetch-eox
-- --region <name>` run that has landed tiles in this tree.

| Region             | Harvested  | z13 tiles |
| ------------------ | ---------- | --------- |
| Copenhagen         | 2026-09-03 | 2184      |
| Amsterdam          | 2026-09-03 | 435       |
| Paris              | 2026-09-03 | 360       |
| Chicago            | 2026-09-03 | 441       |
| Sydney             | 2026-09-03 | 456       |
| Hong Kong          | 2026-09-03 | 494       |
| New York           | 2026-09-03 | 588       |
| Buenos Aires       | 2026-09-03 | 285       |
| Cape Town          | 2026-09-03 | 560       |
| Tokyo              | 2026-09-03 | 323       |
| Rio de Janeiro     | 2026-09-03 | 255       |
| Grand Canyon       | 2026-09-03 | 532       |
| Great Barrier Reef | 2026-09-03 | 672       |
| Bora Bora          | 2026-09-03 | 168       |
| Sossusvlei         | 2026-09-03 | 361       |
| Everest            | 2026-09-03 | 280       |
| Giza               | 2026-09-03 | 360       |
| Sjælland           | 2026-09-03 | 3472      |

## Per-region layout

Tiles land at `data/raw/eox/<region>/<z>/<row>/<col>.jpg`, one subdirectory
per registry region — `<region>` is the exact kebab-case key from
`tools/fetch/eoxRegions.ts`, which also doubles as the harvest's directory
name. `eoxTileSource` (`tools/textures/eoxTileSource.ts`) treats every
subdirectory of the coverage dir holding a `13/` tree as one region and
declares one `coverage` box per region; a region's own harvest tree must
still be one contiguous rectangle of tiles (no gaps within it).

## Layer year and licence

The harvest uses the **2025** `s2cloudless-2025` layer. Upstream, it is
CC BY-NC-SA 4.0; EOX IT Services GmbH granted the maintainer written
permission by email in September 2026 for skymap to use the newest
vintages, so this repo runs under that permission rather than the licence's
own ShareAlike terms. The layer id is pinned in `tools/fetch/fetchEoxTiles.ts`;
there is no CLI flag to select a different one.

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
today (`<z>` in the per-region layout above is currently always `13`).

## How to obtain

```
npm run fetch-eox -- --region <name> [--level 13]
```

`<name>` must be a key in `tools/fetch/eoxRegions.ts`; an unknown or missing
`--region` throws listing the available names. Sequential, throttled to ~4
requests/second, with exponential backoff on retryable failures (429/503/5xx
or a network error) — same backoff shape as `tools/fetch/fetchDesi.ts`.
Resumable by tile-file existence: re-running the same region/level skips
every tile already on disk, no separate chunk-state sidecar (a tile is
atomically whole-or-absent). A non-image response (a throttled EOX origin
serving an HTML page instead of a JPEG) throws and stops the run rather than
writing HTML bytes into the tile tree under a `.jpg` name.
