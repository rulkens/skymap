# Cursor-anchored orbit drag — one scalar rate cannot make the ground follow the cursor

`needs-design` · UI & UX

## What happens

Dragging near a body's surface moves the ground under the cursor at roughly the right
speed, but not to the right place. Two specific failures, both reported from the browser
on 2026-07-30:

- **Off-centre drift.** The ground tracks the cursor at the screen centre and increasingly
  lags it toward the edges, so grabbing a feature near the limb and dragging does not keep
  that feature under the pointer.
- **Latitude dependence.** Yaw becomes progressively less effective as pitch approaches the
  poles, to the point where dragging horizontally barely moves the globe. A yaw of `Δ`
  sweeps the sub-camera point along its latitude circle by `R · cos(pitch) · Δ`, not by
  `R · Δ`, and the rate carries no `cos(pitch)` term.

## Why

`orbitRadPerPixel` damps the drag by altitude so the ground moves at cursor speed rather
than the ~350× too fast flat rate it replaced (`min(ORBIT_MAX_RAD_PER_PX, 2·tan(fovY/2)·h /
(cssHeight·R))`). That fixed the magnitude, and a single scalar rad-per-pixel is
structurally unable to fix the direction: it is applied uniformly across the drag and to
both axes, while the mapping from pixels to rotation depends on WHERE in the viewport the
gesture started and on the current pitch.

An exact fix is not a better rate. It is a different formulation: unproject the cursor,
intersect the body's sphere to get a world hit point, and rotate the camera so that hit
point stays under the cursor — i.e. solve for the rotation rather than integrate a rate.

Note that the aspect ratio is NOT part of this. Under `mat4.perspective(fovY, aspect, …)`
world-per-pixel is isotropic — the horizontal field of view widens in exact proportion to
the extra pixels — so `cssHeight` is the correct denominator for both axes and no aspect
term is missing.

## Approach

Shares its whole prerequisite with [surface-directed
zoom](2026-07-30-surface-directed-zoom.md): both need a cursor-to-surface raycast that does
not exist anywhere in the codebase yet (the pick path resolves an identity, not a world hit
point), and both then need to move the orbit `target`, which the frame loop's pivot-pin
currently overwrites every frame for any driver declaring `pivotsOnFocusedBody`. **Design
them together** — solving the raycast and the pivot-pin conflict once serves both, and
doing them separately would mean two designs against the same two obstacles.

Until then the altitude damping is a deliberate approximation and its limits are documented
in `orbitRadPerPixel`'s header.
