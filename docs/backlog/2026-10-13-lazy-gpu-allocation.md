# Lazy-allocate GPU resources for off or invisible features

**Readiness:** `ready`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 3.

Allocated at boot whatever the settings say:

- Flow particle buffers, 26.6 MB fixed (`src/layers/flow/render/flowFieldRenderer.ts:102-115`,
  `MAX_PARTICLES × TRAIL`), created in the Layer's `create` though flow is off by default.
  Allocate on first enable; the 32 × vec4 f32 trail ring is 25.6 MB of it.
- Render-target rows with no `allocateWhen`: the bloom pyramid (`renderTargets.ts:141`)
  with `settings.bloom.enabled` false, and `cosmic-web-density`, `zoa`,
  `star-aggregates`, `mw-aggregate` with their layers hidden. The capture rows already
  show the pattern (`captureRowAllocateWhen`).
- Debug pick targets kept after the pick-debug overlay is turned off.

The hi-res famous array (32 MB) and galaxy atlas (16 MB) are also eager at the Earth
boot view; gate those with [scale-gated demand](2026-07-24-scale-gated-asset-demand.md),
not here.
