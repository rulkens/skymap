# AssetSlot keeps every committed value and never disposes a superseded one

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 5.

`AssetSlot` holds the committed value until `release()` (`AssetSlot.ts:113,283`), and
drops a superseded fetch's value at its race-checks (`:165`, `:185`) with no hook to
dispose it.

- **Retained, never read after upload:** volume voxels (155 MB MCPM at large), the flow
  cube, `FilamentCloud`, `ShellMesh` (views into the whole ~11 MB fetched buffer).
- **Superseded, never disposed:** the hi-res famous pair allocates its GPU texture in
  `fetch` (`wireHiResFamousSlot.ts:27`), so a tier drift inside one microtask leaks it
  to GC; superseded body-texture and mesh bitmaps go unclosed.

## Directions

An optional `dispose(value)` on `createAssetSlot`, run on both supersede paths; and a
per-slot choice to keep only a marker after commit for consumers that never re-read the
payload. Open: the second race-check runs after `commit` already had side effects.
