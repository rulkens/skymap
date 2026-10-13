# Pick targets are canvas-sized to read one texel

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 2.

`pickProgram` renders each slab into a full-canvas r32uint + depth pair
(`src/services/engine/frame/pickProgram.ts:162`) and copies back a single texel
(`:428`). Up to four pairs (`pick:cosmo`, `pick:near0`, `pick:overlay`, `pick:body`)
stay allocated for the session: 66 MB at 1080p, 265 MB at 4K. Every hover pick also
rasterises the whole viewport. Debug pick targets (`debugBodyTargets`) are evicted only
inside `renderForDebug`, so they outlive the overlay.

## Direction

Render each slab into a small fixed target (1×1, or a few px for the pick pad) through
an off-centre projection that maps the cursor's pixel to the target — the same frustum
shift the backlog's lens-shift item needs. Open: whether the pick pad (a disc in device
px) survives as a tiny target or becomes a shader-side radius.
