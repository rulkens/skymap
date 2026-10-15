# AssetSlot keeps committed values nothing re-reads

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 5.
Disposal of superseded payloads (the `dispose` hook) landed separately; this item is the
retention half.

`AssetSlot` holds the committed value until `release()` (`AssetSlot.ts`, `lastReady`),
but several slots' consumers read it only once, in the commit or the `ready`
notification: volume voxels (155 MB MCPM at large), the flow cube, `FilamentCloud`,
`ShellMesh` (views into the whole ~11 MB fetched buffer), the structure payload (the
store keeps its own projection). That is JS heap held for nothing.

## Directions

A per-slot choice of what the slot keeps after commit (a residency marker instead of
the payload), typed so `current()` callers that need the payload cannot opt out by
mistake. Open: the generic shape (a `resident` mapping on `createAssetSlot`, or the
fetcher returning a payload the commit consumes).
