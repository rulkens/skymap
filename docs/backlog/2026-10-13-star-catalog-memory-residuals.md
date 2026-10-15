# Star catalog memory residuals

**Readiness:** `ready`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 4.

- A tier switch refetches and re-decodes the octree index, though the `octree` format
  is tier-less: tier only sizes the pool (`starCatalogFetcher.ts:74-81`).
  `resizeStarPools` can resize in place; the tier belongs out of the request.
- The cut's capture copy (`starCutGpu.ts:406`, 6.3 MB medium / 12.6 MB large) stays
  after the capture that needed it.
- `starCatalogSlot`'s `onRelease` destroys only the chunk stream, not the renderer's
  records or the cut buffers. Inert today (no release row); a trap for the first one.
