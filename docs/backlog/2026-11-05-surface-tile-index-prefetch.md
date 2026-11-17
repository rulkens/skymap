# Surface-tile index prefetch

**Status:** `ready` — accepted cost at landing (2026-11-05), fix deferred.

## Problem

Since surface tiles moved into per-level archives, every level's first tile waits on that
level's `z<z>.idx` before its Range read. On the loadtime 3g profile (300 ms RTT) the first
Earth tile over Copenhagen landed 0.5–0.7 s later: 13.1 s became 13.6–13.8 s over 3 runs,
with the first frame at 11.6 s in both. On fast-4g it costs 0.1 s. `surfaceRequests` rose
from 92 to 110, which is the index fetches.

## Where

- `src/layers/body/surfaceTiles/stream/load/createArchiveTileSource.ts`: indexes are fetched
  lazily, one memoised promise per (product, z).
- The source is made at engage, in `stream/subsystems/surfaceTileStream.ts`.

## Option

At engage, start the index fetches for the coarse levels (the base level up to about
base + 2, both products) instead of waiting for the first tile to ask. These indexes are
small: z3 is 512 B and z5 is 8 KB. The first tile's request then overlaps the index fetch
instead of following it.

Measure with `npm run loadtime -- --profile 3g --link '<the Copenhagen pose link in tools/loadtime/README.md>'`.
The target is `firstSurfaceTile` within one RTT of the 13.1 s baseline.
