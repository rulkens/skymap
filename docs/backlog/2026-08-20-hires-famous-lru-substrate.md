# Fold `hiResFamousSubsystem` into the shared streamed-asset LRU substrate

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md)
§4 item 7, "Streaming/LRU"; ladder assignment in §6's table: "backlog (or
ride rung 3's streamed work if cheap)"). `ORPHAN` in the 2026-08-20
carry-forward audit — no backlog file exists.

## What it is

The engine has a shared streaming/LRU substrate for paged assets (the
pattern `earthTiles` uses — the "streamed" artifact kind, decisions.md #7).
`hiResFamousSubsystem` (`src/services/engine/subsystems/hiResFamousSubsystem.ts`)
is a LOD-3 per-frame planner for Famous-source galaxies: when a curated
galaxy's apparent size crosses ~120 px it crossfades from the shared
128 px atlas tile to a 512²/1024² hi-res WebP held in a small fixed-capacity
`texture_2d_array` (`hiResFamousTexture.ts`). Rather than routing through the
shared substrate, it bypasses it and re-implements its own in-flight/
failure/eviction bookkeeping — the sweep notes "its own header admits this."
The result is two LRU implementations in the codebase differing only in
victim policy.

## Why it matters

Cleanup / duplication, not a live bug: `hiResFamousSubsystem`'s own header
argues its bypass is deliberate — the famous catalog is ~75 rows, small
enough that the LOD-1/LOD-2 planners' decimation trick "buys nothing," so it
walks the full catalog every frame rather than using sticky maps. That
reasoning may still hold. The cost is maintenance surface: a second
in-flight/failure/evict implementation means bugs in eviction bookkeeping
(a classic streaming-substrate failure mode — see the [asset-loading
audit](2026-07-22-asset-loading-audit.md) backlog item for the broader
"what evicts and when" gap) have to be fixed twice, and the two victim
policies can silently drift apart with no test comparing them.

## Approach

No design done. The ladder assignment suggests two paths, either acceptable:

1. **Standalone backlog pickup** — audit whether `hiResFamousSubsystem`'s
   bypass reasoning (75-row full walk, no decimation needed) still applies,
   and if so, whether only the LRU/eviction half (not the full-walk planner
   logic) can be folded into the shared substrate without reintroducing the
   sticky-map overhead the header explicitly avoided.
2. **Ride rung 3's streamed work** — per the sweep's own ladder-assignment
   note, if a future streamed-substrate rung (rung 3 covered MW cloud-gen
   staleness + earth's third ingest path) is already touching the shared
   LRU code, folding `hiResFamousSubsystem` in at the same time may be
   cheap opportunistically. Check rung 3's actual scope before assuming
   this is still open — it may have shipped narrower than this note
   anticipated.
