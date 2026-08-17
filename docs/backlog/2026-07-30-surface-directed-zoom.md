# Surface-directed zoom — the wheel can only dolly toward the body's centre

`needs-design` · UI & UX

## What happens

Hovering a spot on Earth and scrolling in does not approach that spot. The camera
closes on the body's CENTRE, so whatever was under the cursor slides toward the limb
as the distance shrinks. To inspect a particular feature you zoom in, then drag to
re-centre, then zoom again — the zoom and the aim are two separate gestures where
every other globe viewer makes them one.

## Why

Every zoom path scales `cam.distance` and nothing else: the orbit camera's position is
`target + dir(yaw, pitch) · distance` (`updatePosition`), and while a body is focused
the frame-loop pivot-pin overwrites `target` with the live body position on every
driver that declares `pivotsOnFocusedBody` (`cameraDrivers.ts`). So the target is the
body centre by construction — a zoom cannot bias toward the cursor without moving the
target, and the pivot-pin would immediately undo it.

Making it cursor-directed needs a world position for the cursor, which does not exist
today. The pick path resolves an _identity_ (`pickProgram` → `SelectionRef`), not a
depth or a hit point, so there is no ray-surface intersection anywhere in the codebase
to lerp the target toward.

## Why it is convenience, not capability

The per-body zoom floor landed first (`clampDistance` now floors at
`SURFACE_STANDOFF_RADII` above the framed body's surface). Low-altitude dwelling
therefore already works: the camera parks just off the surface and orbit-drag sweeps
it across the globe, so any surface detail can be reached and inspected. What is
missing is the directness of getting there, not the ability to.

## Shape of a fix — undecided

Two independent pieces, and the first is the interesting one:

1. **A cursor → surface world position.** For an analytic sphere the cheap answer is a
   CPU ray-sphere intersection: unproject the cursor to a ray through the near plane
   and intersect the focused body's sphere, no GPU readback and no depth buffer. That
   only works for bodies (a galaxy cloud or a volume field has no analytic surface),
   which suggests it belongs beside the body-focus code rather than in the generic pick
   path. The alternative, reading depth back from the pick pass, is general but adds an
   async readback to a per-wheel-tick path.
2. **Biasing the pivot.** Given a hit point, the standard move is to lerp `target`
   toward it as `distance` shrinks, so the target converges on the hit point at the
   floor and returns to the centre on zoom-out. That has to be reconciled with the
   pivot-pin, which currently asserts the body centre unconditionally — the pin's rule
   would become "pivot on the focused body, offset by the zoom's surface bias", and the
   offset needs a home that a drag and the follow ease both read.

A cursor miss (scrolling with the pointer off the globe) must fall back to the current
centre-directed behaviour, so the ray test's null case is part of the design, not an
edge case to bolt on.

## Provenance

Split out of the per-body zoom floor while implementing it: the floor made surface
inspection possible, and surface-directed zoom is the separate, larger question the
floor deliberately left alone.
