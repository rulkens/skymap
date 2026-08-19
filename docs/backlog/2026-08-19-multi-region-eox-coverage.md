# Multi-region EOX coverage

`eoxTileSource` (`tools/textures/eoxTileSource.ts`) declares `coverage` as one
bounding row/col rectangle over everything under `data/raw/eox/13/` — it
supports exactly one contiguous harvested patch. A guard added alongside this
note throws at construction if the harvest tree isn't a full rectangle (see
`eoxTileSource.ts`'s contiguity check), so a second `npm run fetch-eox` region
fails loudly at bake time instead of silently making `coverage` claim the
whole span between the two patches (a 404 storm across whatever ground lies
between them).

## Why this is on-disk, not just a runtime concern

`fetchEoxTiles` writes every region into the SAME flat tree
(`data/raw/eox/13/<row>/<col>.jpg`, no per-region subdirectory), so nothing on
disk identifies which tiles belong to which harvest once two regions land.

## Wanted

Decompose the on-disk row/col set into connected rectangles (or per-row runs)
and emit one `coverage` box per component — `bakeAll` already writes one
manifest entry per coverage box (`tools/textures/buildEarthTiles.ts`), so the
rest is free once `eoxTileSource` produces more than one box. Per-region
identification then has to come from the tile set's own shape (the connected
components) or from giving `fetchEoxTiles` a region subdirectory and reading
`coverage` per subdirectory — either avoids inventing a new sidecar file.
