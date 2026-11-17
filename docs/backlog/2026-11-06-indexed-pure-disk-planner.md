# Indexed pure disk planner

Follow-up to #1073, ruled 2026-11-06. Today sky captures replay the rig's culled disk list, so a capture lacks disks for
galaxies outside the view; this planner gives each capture its own coverage cheaply.

## Problem

The galaxy disk walk is decimated (1/8 of rows per frame) because walking ~2.5M rows each frame is too slow. That one fact
forces most of the pipeline's mutable state: stride cursors, sticky maps per source, `lastOutput` on three subsystems,
results that depend on earlier frames; and it is why captures cannot plan their own sky (a full walk per bake).

## Shape (sketched 2026-11-06)

- **`DiskIndex` per catalog block**, built once when the block arrives (pure, in a worker, no `.bin` format change):
  cells with `center`, `radius`, `maxDiameterKpc`, and a row range. Immutable.
- **`planDisks(index, views, cache, settings, nowMs) → { textured, procedural, demand }`**, a pure function. Each cell is
  tested against the views' frustums, the occluder cones and a distance bound (`maxDiameterKpc · pxPerRad / 8`), and only
  rows in passing cells are visited. Rig views and capture faces call the same function; at a capture's low resolution
  the distance bound rejects almost every cell.
- **`ThumbCache` as a value**: `slots`, `landedAtMs` and `pending`, replaced each frame by pure reducers
  (`admitLanded`, `allocate`). Fetches and uploads are returned as effects and run by one shell step. The load fade is
  `clamp((now − landedAt) / 400)`, derived.
- **Capture re-bake by stamp**: band, settings, content version and the capture plan's thumbnail set. Cheap enough to
  compute every frame once the query is indexed.

## Deletes

Stride cursors, sticky maps, `bitmapReadyTime`, the `frameCounter` LRU, the procedural renderer's retained pick list, and
the hiResFamous `byFamousIdx` map that is cleared and refilled every frame.

## Open

- Align with the GLADE octree (draft #932) rather than build a second spatial index.
- Measure the query at 0.5°, 60° near Earth and on a capture before committing to cell sizes.
