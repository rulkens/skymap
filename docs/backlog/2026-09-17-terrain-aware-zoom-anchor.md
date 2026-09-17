# Terrain-aware zoom anchor

`ready` — the one row that makes F3a's terrain floor _feel_ right. Its own PR,
sequenced immediately after F3a (user, 2026-09-17).

## The problem

F3a routes the camera floor to the terrain (`groundRadiusAtM` returns
`datumRadiusM + terrainHeightAt(dir)`), so the eye can no longer descend through
Everest. It deliberately leaves the _rate_ of descent on the datum, and that
combination feels worse than either end of it:

- On Everest the eye can be 2 m above rock while `h/R` reports 8.8 km. Each notch
  aims at a point 8.8 km _below_ the ground in view, so the steps stay large and
  the eye slams into the floor instead of easing onto it.
- Over the Dead Sea it inverts: the datum is 400 m above the ground, so the last
  400 m are crept through at a rate meant for a surface that is not there.

Before F3a there was no floor at all, so the datum-based rate was at least
self-consistent. F3a makes half the pair right, which is what exposes it.

## Verified current state

- `src/utils/camera/surfaceZoomStep.ts:58` — the anchor is a ray/sphere
  intersection against the datum: `pickOnBody(cursorRayBodyLocal(...), bodyRadiusM)`,
  where `bodyRadiusM` is `datumRadiusM`.
- `src/utils/camera/surfaceZoomStep.ts:78` — `hrPre = |bodyFixedEyeM(arm)| / bodyRadiusM - 1`,
  the band term, likewise datum-based.
- `src/utils/camera/anchoredZoomStep.ts` — its nadir-fallback anchor stays on the
  datum too, so "one notch out undoes one notch in" measures against a different
  surface than the floor pushes off. Same root cause, same fix.
- `src/services/engine/camera/rungs/bodyRung.ts` — supplies `groundRadiusAtM`,
  already terrain-aware after F3a. A per-direction height is therefore available
  at the pick site without new plumbing.

## Scope: five sites, one helper

The zoom anchor is not a lone call. `pickOnBody.ts:10` is the shared ray/datum
intersection behind `latchSurfaceGesture.ts:20`, `draggedSurfacePose.ts:41` and
`surfaceZoomStep.ts:59`, and two more gestures intersect the datum directly:
`anchoredDragRotation.ts:33` (`pickDir`, the drag anchor) and
`poseFrameConversion.ts:94` (the arm's range). All read `HostBody.radiusM`, which
is the datum by contract (`src/@types/camera/HostBody.d.ts:9-10`).

Fixing the zoom anchor alone leaves the drag tracking at the wrong rate over the
same terrain, which reads as a worse bug than either half: the ground slides under
the cursor. Whichever of these lands first sets the shape for the rest — they must
not each grow their own answer. See
[`2026-09-17-terrain-f3b-remaining-routing.md`](2026-09-17-terrain-f3b-remaining-routing.md),
which covers the other four and prices the error properly (`h·tan θ`: ~15 km at 60°
incidence, not the spec's flat 8.8 km, which is only the nadir case).

## Options

1. **March the ray against the height grid.** The honest fix and what spec §8.3's
   `raycast` row describes: intersect the outer-bound sphere, then march. Correct
   for oblique rays across a ridge, and it is the piece F3b needs anyway.
2. **Iterate `groundRadiusAtM` at the ray's nadir.** Two or three fixed-point steps
   on the sphere intersection, re-reading the height under each candidate point.
   Cheap, no new machinery, converges fast for near-nadir rays — which is the
   regime the zoom anchor is actually used in. Wrong for grazing rays across a
   ridge line, where it can converge to the near side of a peak.

Option 2 is probably the right first cut given the zoom anchor's actual usage, with
option 1 arriving when F3b builds `raycast` properly. Price both before committing.

## Not in scope

The h/R band arithmetic (`hOverR`, `bodyUpWeight`, `mappedTiltRad`,
`approachTiltedPose`, `releasedWorldRoll`, `pivotRadiusMpc`) stays on
`datumRadiusM` unless a separate ruling moves it — §8.3 holds that those are
camera feel, and re-basing them changes behaviour far beyond the zoom.

## See also

- Spec `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §8.3, and
  §12's `F3b` row (currently "not scoped"; its atmosphere row is gated on the
  depth-aware composite in §2, which is why this is NOT filed as part of F3b).
- F3a plan: `docs/superpowers/plans/2026-09-16-terrain-f3a-height-lookup.md`.
