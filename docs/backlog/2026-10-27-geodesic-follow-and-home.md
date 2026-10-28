# Follow-approach and Home on the geodesic

**Readiness:** `needs-design` (needs its own spec section first; see below).

PR 1 of geodesic focus moves (`specs/2026-10-27-geodesic-focus-moves-design.md`) ships the
Eased/Geodesic toggle, but two moves stay Eased under either value: the planet follow-approach and
Home. Both end on a body the sim clock moves. PR 2 puts them on the geodesic.

## The moving-endpoint problem

A geodesic is computed between two fixed poses. A moving body makes the end pose a function of
time, so the path computed at dispatch aims at where the body WAS. Eased tolerates this because it
re-targets nothing: it interpolates to a pose and the follow driver closes the gap on hand-off. A
geodesic window of up to 2.2 s with an endpoint frozen at dispatch lets Earth drift that far before
the hand-off.

The fix #531's `followBody` took: re-measure the geodesic against the body's current pose every
frame, so the path bends toward the moving end instead of aiming at a stale one.

## The snap lives in the pin

Main's follow rows (`followApproach`, `followHold` in `cameraDrivers.ts`) declare
`pivotsOnFocusedBody: true`. The pin sets `target = body + panOffset` absolutely after the driver
runs, so it would overwrite every geodesic target the approach writes, and the pivot would snap.
#531 opted `followBody` out of the pin and added `panOffset` itself, as `clip` and `tween` do
(#531 spec §1). The accepted cost is that a drag mid-approach snaps the pivot.

## Tuning frozen with the duration

#531 re-read the tuning (`selectGlideTuning`) every approach frame, so a ρ slider drag mid-approach
re-shaped the path. That breaks PR 1's rule that a move is frozen at the click. PR 2 captures the
whole `GeodesicTuning` in `FollowMemory` at activation, beside `durationMs`.

## Duration frozen at activation

Re-measuring each frame makes the arc length change each frame, and the duration derives from arc
length (`clamp(S / V, minMs, maxMs)`). A duration that follows it makes the progress fraction jump.
Freeze the duration when the follow row activates. `shouldKeepTicking` and the end check both read
it, so a duration that moved would extend or truncate the flight mid-air.

## Home's hand-off to the follow driver

`watchGoHomeSaga` tweens to `bodyHomePose`, the sunlit framing of Earth. `watchFocusTweenSaga`
no-ops for followed bodies, so that tween is the sole mover. On its end the follow driver activates,
captures the tween's end pose as its `from`, and re-seeds its distance target to the framing
distance the pose already carries. The hand-off is seamless only because the camera arrives at that
framed pose. A geodesic Home has to arrive at the same pose, at rest, or the driver takes over a
camera that is still moving. Home also overrides orientation on purpose (sunlit side), which the
geodesic does not model today; check that before moving it.

## Out of scope here

`flyToLonLat` on the geodesic, tour clips authoring `geodesic()`, and a remote-page toggle stay as
listed in the PR 1 spec's non-goals.
