# Terrain: grey holes at the bottom of the screen, sea-level camera + high tilt

**Status:** parked 2026-09-15 during F2 (`terrain-f2-displacement`, PR #719)
after one fix attempt that did not change the symptom. Ships with F2 as a
known issue.

**Symptom.** Everest (86.955 E, 27.932 N) and the Copenhagen z13 ring around
Søndermarken: with the orbit target sunk to sea level (camera ~0–2 m above
the datum) and the view tilted well toward the horizon, grey rectangles sit
at the bottom of the screen (the ground nearest the camera) and never fill.
Only z13 EOX areas; lower-z areas fine. LOD overlay: no tint, so no patch is
drawn there at all. Readout: `height 373/1024 · plan: 124 req · zWin 13 · 0
miss · cut: 38 tiles drawn`. F2 draws the base globe at
`innerBoundRadiusM`, so an absent leaf shows sky/haze grey; F1's datum BMNG
hid the same holes.

**Tried, in order.**
1. Frustum-cull oracle (30 poses, real bands, ideal residency, camera well
   above the datum): zero holes; culled children are drawn by their parent.
   A tighter slab bound (relief range → [min,max]) was neutral and dropped.
2. Sparse-tile hypothesis (404 → `isFailed`, never retried, over water):
   refuted by `0 miss` in the readout.
3. Instrumented walk at camera 2 m, tilt 10°, azimuth 0, Everest: step 1
   "Horizon" in `cutSurfaceTiles.ts` culled `z11 1519/352` on the flat-datum
   angle (`centreAngle 0.00289 − patchAngle 0.00205 > capAngle 0.00079`)
   with four z13 tiles (6073–6076/1411) on screen in the bottom third
   missing from the cut; azimuths 90/180 clean; camera −50 m planned
   NOTHING (early return for `camLen <= radiusM`).
4. Fix d8636f2f1 (kept, correct on its own): horizon cap widened by
   `acos(1/(1+relief))` from the node's `reliefHeadroom`; early return
   replaced by a clamped cap radius so an under-datum camera still plans.
   Suite green, one load-bearing test (−50 m cut non-empty). **User
   eye-check on :5175: symptom unchanged.** The hand-written repro tests
   turned out to pass before the fix as well (their node was governed by the
   already relief-aware frustum step), so the instrumented cull in (3) was
   real but not the cause of the visible holes.

**Where to look next.** The holes are leaves ABSENT from the cut with 0
misses and plenty of atlas room, so either (a) the walk never emits them —
instrument the real in-browser pose (not a synthetic one; the sub-camera in
the readout plus the orbit pitch) and diff the cut against the tiles under
the bottom rows of pixels, checking step 2's near-plane-straddle branch and
"every child culled → parent is the leaf" for parents that are then dropped
for a null `heightOf`/residency; or (b) they are emitted but dropped in
`surfaceTileSubsystem.update()` between the touch and allocate passes
(124 req vs 38 drawn is a large gap for one view). Add a per-frame
"dropped: N (reason)" line to the atlas readout before theorising further;
that readout would have settled (a) vs (b) in one eye-check. A cheaper
visible mitigation, independent of the cause: draw the base globe at the
datum wherever no patch covers, so a missing leaf reads as flat BMNG rather
than sky (this is exactly why F1 never showed the holes).
