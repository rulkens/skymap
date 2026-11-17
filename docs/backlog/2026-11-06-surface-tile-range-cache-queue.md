# Surface-tile Range reads queue in the HTTP cache

**Status:** `deferred` — measured 2026-11-06, no in-app gain, parked by the owner.

## Problem

Chrome's HTTP cache lets one request at a time work on a cache entry, so concurrent
Range reads into the same `.pack` part finish one after another. Twelve 40 KB reads
of one part, from a page on the production origin against the live edge:

| fetch option      | all 12 done           |
| ----------------- | --------------------- |
| default           | 375–460 ms, staircase |
| `cache: 'no-store'` | ~70 ms, parallel    |

Firefox's cache locks entries per URL too. Before the archives, each tile had its own URL.

## Why parked

In the app it barely shows: `SURFACE_TILE_CONCURRENCY` is 4 per product and reads
spread over several parts. At the 2026-11-05 Earth pose (drag, DPR 2, production data),
the median tile read was 53/111/194 ms by default against 43/82/51 ms with `no-store`,
and about 105 ms at load either way. That difference is smaller than the network noise.
`no-store` costs the browser cache: a repeat read is 1 ms today, after a reload too.

## Where

- `src/layers/body/surfaceTiles/stream/load/createArchiveTileSource.ts`: the part's Range `fetch`.

## Revisit when

A view requests many tiles from one part at once (a fast zoom into a dense band), or the
concurrency rises. Measure the burst first, then weigh `no-store` against a Cache Storage
layer keyed per tile, which keeps the browser cache.
