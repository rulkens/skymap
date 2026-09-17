# The camera floor clips through sharp peaks

`ready` — seen at Everest during F3a's eye-check (user, 2026-09-17). The floor
follows the terrain, but it is possible to get the eye inside the drawn surface at
a summit.

## Why

The CPU and the GPU read the same heights at different resolutions, by design.

`terrainHeightM` samples the `SHGT` chunk's **17×17** grid, which is every 8th image
pixel (`HEIGHT_GRID_STRIDE = 8`, spec §8.4). The shader displaces against all
**129×129** posts. So between two grid posts the CPU bilinearly interpolates a chord
while the drawn surface follows the real profile above it. On a broad slope the two
agree closely; on a summit narrower than the grid spacing the chord passes under the
peak and the floor sits below the terrain the eye can see.

The grid spacing in ground metres is the tile's span over 16 cells. At Everest's
deepest baked level the drawn surface resolves detail the floor cannot see at all, so
this is not a tuning error — it is what stride 8 buys.

Two smaller contributors, both worth ruling out before assuming the stride:

- The floor reads the deepest **resident** ancestor, so during streaming it is a
  coarser tile's grid, which is smoother still. A clip that only happens while flying
  in and settles after a second is this, not the stride.
- `terrainHeightM` returns 0 when no ancestor is resident. That is the datum, not the
  ground.

## Options

1. **Finer stride.** `HEIGHT_GRID_STRIDE` 8 → 4 gives 33×33 posts, 3,267 B per tile
   instead of 867. On 20,684 tiles that is ~68 MB against today's ~18 MB, and fully
   resident across 1,024 height slots it is ~3.3 MB instead of ~890 KB. Costs a
   re-bake and an R2 sync. Halves the chord error; does not eliminate it.
2. **Bias the floor upward by the tile's own residual.** The header already carries
   `geometricResidualM` — max |this level's bilinear − the finest level| inside the
   tile — which is exactly the quantity that bounds this error. Add it to the floor
   and the eye can no longer enter the drawn surface, at the cost of hovering that
   much above it on smooth ground. Free: no re-bake, no extra bytes, and the field is
   already decoded and thrown away.
3. **Bias by `subtreeMaxM` near the summit.** Over-conservative — it would hold the
   eye up by the whole subtree's relief.

Option 2 looks like the answer and is the reason `geometricResidualM` exists; it
wants measuring against the eye-check before committing, since "hovers above smooth
ground" is a feel regression traded for a correctness one. Note the residual is
currently decoded and dropped — `ResidentHeightLookup` was narrowed to `gridCodes`
alone during F3a, so this needs it put back.

## Not in scope

Vertical exaggeration, oblate datums, and the h/R band arithmetic — see the terrain
spec's "Out of scope".

## See also

- `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §8.4 (the stride
  ruling and its rejected alternatives), §11 (post addressing).
- `docs/superpowers/plans/completed/2026-09-16-terrain-f3a-height-lookup.md`.
- `docs/backlog/2026-09-17-terrain-aware-zoom-anchor.md` — separate, and the two are
  felt together at a summit: the anchor paces the descent, this sets where it stops.
