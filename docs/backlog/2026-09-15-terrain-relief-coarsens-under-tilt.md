# Terrain: relief detail drops to a coarser mesh as tilt rises near the surface

**Status:** parked 2026-09-15 during F2 (`terrain-f2-displacement`, PR #719),
user eye-check finding; cause not confirmed.

**Symptom.** Low over Søndermarken (z14–19 band), raising the camera tilt
toward the horizon makes the terrain relief visibly coarsen: height detail
that was there at a steeper look-down angle disappears, as if a coarser
mesh/height field took over. Texture may or may not coarsen with it (not
separated in the eye-check).

**Hypothesis (unverified).** `cutSurfaceTiles.ts` refines on the tile's
projected screen size (9 datum samples → bbox → `screenPx` → required
level). Under high tilt the footprint foreshortens, `required` drops, and
the walk stops at a coarser leaf. On F2 a patch's height lattice is the
LEAF's own posts (R14), so a coarser leaf halves the relief resolution as
well as the texture's — at z13 a post is ~38 m across Søndermarken's 20 m
hills, which flattens them. Grazing views also make the datum-plane bbox a
poor proxy for the drawn, displaced surface (see the sibling horizon-cull
item, now fixed on F2, for the cull-side version of the same datum-only
assumption).

**To check first.** Debug readout ("cut by level", zWin) at the same spot at
low vs high tilt; the LOD overlay's tint ladder; whether `lodBias` or a
relief-aware term in the required-level estimate (e.g. never coarsen the
height lattice below the level whose post spacing resolves the subtree's
relief range) restores the detail without blowing the request count.

**Tooling prerequisite (own index line): height-LOD debug overlay.** The
existing `earth-lod-overlay` tints by the ALBEDO rect's level delta only.
The fragment stage already carries `heightLattice.z` (the leaf's sub-rect
cell count), so a second overlay mode can tint by
`log2(HEIGHT_CELLS_PER_TILE / heightLattice.z)`, i.e. how many levels
coarser the height field is than the leaf. That separates "texture went
coarse" from "relief went coarse" in one eye-check and is the first thing to
build when this item is picked up.
