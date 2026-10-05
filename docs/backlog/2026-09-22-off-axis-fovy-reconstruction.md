# `turnedOrbitCamera` synthesises an exact fovY an off-axis frustum doesn't have

**Raised:** 2026-09-22, per-view planning prep (`docs/superpowers/plans/2026-09-22-per-view-planning-prep.md`
Task 7). Latent today — every rig's frustum is symmetric — and not fixed by
that prep, which only reworked `worldLenToPx`'s use of the camera prefix.

`turnedOrbitCamera` (`src/utils/camera/turnedOrbitCamera.ts:34`) builds the
`OrbitCamera` every `ctx.cam` reader draws from, deriving `fovYRad` from the
view's frustum extents (`Math.atan(frustum.tanUp) - Math.atan(frustum.tanDown)`).
Its own comment admits the fabrication: "An off-axis frustum has no exact
(fovY, aspect); these are its extents." A symmetric frustum makes that exact
by coincidence; an off-axis one (a VR eye with a lens shift) would not.

Two consumers derive real geometry from it: `horizonShellRenderer.ts:156`
and `zoneOfAvoidanceRenderer.ts:161` both compute `tanHalfFovY =
Math.tan(cam.fovYRad / 2)` to size their ray-marched shells per pixel — the
same class of bug `worldLenToPx` had (reconstructing a focal term from a
derived value instead of carrying the real one), fixed for the billboard
path by this prep's `pxPerRad` addition, but not for these shell renderers
or `OrbitCamera` itself.

## Fix shape

Give `OrbitCamera` a real off-axis representation — four tangent
half-angles, not one derived `fovYRad` — and have the two shell renderers
read the extents directly instead of round-tripping through
`tan(fovYRad / 2)`. Blocked on a concrete off-axis rig (VR) to size the fix
against; symmetric rigs never exercise the gap.
