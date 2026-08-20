# Earth tile crossfade on zoom-out (symmetric LOD settle)

**Status:** parked by the user 2026-08-20 (follow-up to the zoom-in crossfade,
`bb0379020`).

**Problem.** The zoom-in crossfade keys on upload time and fades a fresh tile
over its resident ancestor's flattened rect. Zoom-out has neither trigger nor
source: the coarser tile taking over is long-resident (weight already 1), and
the imagery it should fade from is *four* finer children in four different
atlas slots — not expressible as the per-instance single fallback rect. So
GD→EOX (z14→z13) and EOX→BMNG (z8→z7) still pop on the way out.

**Agreed shape (chat, 2026-08-20).** Hold-and-fade-over:

- When the cut coarsens over an area, the vanished finer leaves join a
  "retiring" set and keep drawing normally for `EARTH_TILE_CROSSFADE_MS`.
- The incoming coarser leaf draws after them through a blend variant of the
  tile pipeline (alpha = same 400 ms ramp, depth test relaxed for the variant:
  its coarser mesh sits a hair farther than the fine meshes it must cover).
- At weight 1 the retiring leaves drop and everything collapses to the single
  opaque path.

**Cost (why it was parked):** retiring-set lifecycle in the subsystem or cut,
a second pipeline variant in `earthSurfaceTileRenderer`, ordering/lifecycle
tests — the largest of the 2026-08-20 additions, on the per-frame path.

**Touchpoints:** `cutSurfaceTiles.ts` (or subsystem-side previous-cut diff),
`earthTileSubsystem.ts`, `earthSurfaceTileRenderer.ts` (+ layout),
`earthSurfaceTile/*.wesl`, `earthTileParams.ts` (shared 400 ms constant).
