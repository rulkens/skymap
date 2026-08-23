# Star cut bakes one camera origin at prepare time, draw rebases about another

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging) — stereo rendering made a latent mono bug visible.

## What it is

`prepareStarCut` (`src/services/engine/frame/passes/starCatalogLayer.ts:659`)
bakes every octree node's position relative to a single camera position taken
once, at prepare time:

- `:676` reads `ctx.drawCamPos` as the walk's camera position.
- `:802-804` bakes each node's `originRelCamMpc` as `nodePc·pcToMpc − camPos`,
  i.e. relative to that same `ctx.drawCamPos`.
- The result is memoised per-frame on `ctx` (`preparedByCtx`, `:647`), so the
  whole walk + bake runs once regardless of how many layers call it.

Draw time re-derives its own view-projection independently, per view:

- `drawStream` (`:866-874`) and `drawPick` (`:956-962`) both compute
  `rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))`, where
  `view: SlabView` is passed in per draw call.

In mono, `ctx.drawCamPos` and `view.camPos` are the same value (both derive
from the single `OrbitCamera` for the frame), so the two independently-chosen
origins happen to agree — nothing forces them to. The spike's stereo pass
called `drawStream`/`drawPick` once per eye with `view.camPos` at the eye
position while the shared `prepareStarCut` bake used `ctx.drawCamPos` at the
head position: every star was displaced by (head − eye), a visible per-eye
drift. Spike commit `29280645d` fixed it by adding `originMpc` to
`PreparedStarCut` so the prepared data carries its own rebase origin, and
both draw call sites rebase about `prep.originMpc` instead of re-deriving one.

## Why it matters

Byte-identical in mono today, so nothing is visibly broken on `main`. The
risk is the next second-consumer of the shared cut that draws with a
different camera position than prepare time used — a cube-map capture, a
shadow pass, or any other second walk of the same frame. The failure mode is
silent (positions are just wrong, not absent), so it would surface as a
visual bug far from its cause rather than a compile error or exception.

## Approach

Port the spike's fix, stripped of anything VR-specific:

1. Add `originMpc: Readonly<Vec3>` to `PreparedStarCut`, set once in
   `computeStarCut` from the same value the walk already keys off.
2. Change `drawStream` and `drawPick` to rebase about `prep.originMpc`
   instead of `view.camPos`.
3. Add a regression test that prepares a cut at one camera position and
   draws it with a `SlabView` at a _different_ `camPos`, asserting the drawn
   positions rebase about the prepared origin, not the draw-time one — the
   exact case mono has no way to exercise today.

Optional extension, not required for the fix: pair `rebaseViewProj`'s inputs
with their origin at the type level (e.g. a `RebasedView` the function
produces and every consumer accepts), so a future call site can't
accidentally supply a `vp`/origin pair from two different sources. Worth
doing only if a second load-bearing call site of this pattern shows up;
`starCatalogLayer` is the only one today.
