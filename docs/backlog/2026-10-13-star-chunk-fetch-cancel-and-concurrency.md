# Cancel stale star-chunk fetches and raise the chunk concurrency

**Readiness:** `ready`. **Surfaced:** 2026-10-13, transport review of the chunk stream after #885.

## Problem

A chunk the planner no longer wants keeps downloading, lands in the pool and is uploaded to the GPU before LRU evicts it, and the stream runs only four fetches at a time on a host that multiplexes over HTTP/2. On a camera jump both compound: the Milky-Way jump fetched 218 chunks for a 128-slot pool (spec §10), and each stale fetch holds a slot and a concurrency lane while it finishes.

## Current state (verified 2026-10-13)

- `src/data/starChunkConcurrency.ts:2`: `STAR_CHUNK_CONCURRENCY = 4`, copied from `SURFACE_TILE_CONCURRENCY = 4` (`src/data/bodies/surfaceTileParams.ts:50`), whose reasoning was browser connection limits for tiles. The data host answers over HTTP/2 with gzip on the wire and `cf-cache-status: HIT` on the v2 index (probed against `skymap-data.rulkens.com`), so the connection is not the bound. `docs/DEPLOY.md:80` still says every `.bin` is an origin hit; that note is stale.
- `src/utils/concurrency/priorityQueue.ts:182-184`: `drop(key)` removes a pending entry only; an in-flight entry runs to completion by design ("never preempt", docblock at `:170-181`), argued as one rare wasted request. For chunks it is not rare: `starChunkStream.ts:117-118` allocates the slot *before* enqueueing, so a stale in-flight key pins a pool slot until its response arrives, and `onResult` (`:122-126`) uploads it regardless of whether any frame still wants it.
- The planner already knows what is stale: `update()` (`starChunkStream.ts:108-114`) touches every wanted resident and in-flight key each frame, so an in-flight key whose `SlotPool` `lastSeenFrame` is behind the current frame is unwanted.
- `fetchChunkBytes` (`starChunkStream.ts:25-32`) calls `fetch(dataUrl(path))` with no `signal` and no `priority` hint.

## Shape

1. **Cancellation.** `QueueEntry.fetcher` receives an `AbortSignal`; `PriorityQueue.drop` aborts an in-flight entry's controller and removes it from `inFlight` (its `onResult` is suppressed). `starChunkStream.update` cancels in-flight keys not touched for `STAR_CHUNK_CANCEL_FRAMES` frames (hysteresis, first guess ~12 frames: an aborted response is not cached, so a quick pan must not cancel a chunk it wants back next frame), freeing the slot through `pool.evict(key)`, which the evict handler already treats as a no-op on the GPU for a non-resident key (`:66-67`). The surface-tile stream gets the same behaviour for free.
2. **Concurrency.** Raise `STAR_CHUNK_CONCURRENCY` to 8 and measure; 12 and 16 as the sweep. Pass `priority: 'low'` on the chunk `fetch` so chunks never outrank shell assets, or map the planner's proxy to `high`/`low` across the queue head and tail.
3. **Measure, not assume.** `npm run perf` plus the phone run at the two spec poses: bytes to settle and time to settle at Earth, and wasted bytes on the Earth → Milky-Way jump (requests started minus chunks resident at settle). Keep whichever concurrency settles fastest without raising the Earth median frame time.

## Out of scope

Prefetching siblings one level ahead (the index has the geometry; a separate item once cancellation exists, because prefetch without cancellation only widens the waste), HTTP/3 (a dashboard setting, unverified through the probe proxy), brotli (R2 cannot negotiate; small gain on quantised columns).
