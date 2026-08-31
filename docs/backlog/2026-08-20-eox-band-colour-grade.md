# EOX band colour grade (match the base map)

**Status:** follow-up requested by the user 2026-08-20; not started.

**Problem.** EOX s2cloudless tiles read visibly different from the BMNG-derived
base imagery — most notably at sea (BMNG's idealized bathymetry blue vs real
Sentinel-2 water). The band boundary is a colour seam even with the load
crossfade softening transitions.

**Agreed direction (chat, 2026-08-20): live-first, bake-later.**

- Live: a small parametric grade in `earthSurfaceTile/fragment.wesl`, keyed by
  the tile's source band — white-balance gains, lift/gamma, saturation
  (~6 uniforms) — exposed as DebugPanel sliders so tuning iterates in seconds
  instead of per-iteration re-bake + R2 sync.
- Requires the shader to know the sampled tile's source band (today the atlas
  rect carries no provenance) — likely one band-index per tile instance, or a
  per-band uniform table indexed by it.
- A full 3D LUT only if the parametric grade proves insufficient.
- Once dialed: optionally fold the settled values into the bake
  (`--only eox-s2cloudless-2016`) and drop the runtime path.

**Touchpoints:** `earthSurfaceTile/{io,fragment}.wesl`,
`earthSurfaceTileLayout.ts` (+ parity test), band provenance through
`cutSurfaceTiles`/`SurfaceCutTile`, DebugPanel sliders, and eventually
`tools/catalog` bake if values get baked in.
