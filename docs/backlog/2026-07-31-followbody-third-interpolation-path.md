# `followBody` is a third, independent camera-interpolation path

`needs-design`

## The problem

`tween` (priority 60) and `clip` (priority 95), the two camera driver rows
that ease a pose over time, both route through `evaluateClip`, so one
evaluator owns "what does progress `t` through a move look like." `followBody`
(priority 10) does not: it hand-rolls its own lerp, and keeps its own
progress state on `CameraClock` instead of a `CameraTweenDescriptor`. A change
to how moves are eased (or timed) has to be taught to this driver separately,
because there is no shared code path to change once.

## Verified current state

`src/services/engine/camera/cameraDrivers.ts:339-349`, the `followBody`
driver's `pose`:

```ts
const t = easeOutCubic(elapsed / FOCUS_TWEEN_MS);
return {
  target: livePos,
  yaw: lerp(from.yaw, base.yaw, t),
  pitch: lerp(from.pitch, base.pitch, t),
  distance: lerp(from.distance, distanceTarget, t),
};
```

Its progress state lives on `CameraClock` (`src/services/engine/camera/cameraClock.ts:188-207`,
`followElapsed`) as `clock.followFrom`, `clock.followDistanceTarget`,
`clock.followStartMs` — fields with no `CameraTweenDescriptor` counterpart.

The wake-side consequence: every other term in `selectCameraActive`
(`src/state/camera/selectors.ts:49-58`) is a presence check on a camera-slice
field (`c.tween !== null`, `c.dragging`, `c.clip !== null`, …). `followBody`
sets no such field, so `shouldKeepTicking` carries a bespoke,
duration-coupled predicate for it instead
(`src/services/engine/helpers/shouldKeepTicking.ts:106-110`):

```ts
function followApproachEaseActive(state: EngineState, nowMs: number): boolean {
  if (state.cameraRuntime.prevActiveId.current !== 'followBody') return false;
  const start = state.cameraRuntime.clock.followStartMs;
  return start !== null && nowMs - start < FOCUS_TWEEN_MS;
}
```

This predicate and the ease denominator at `cameraDrivers.ts:339` both import
`FOCUS_TWEEN_MS` from `src/services/engine/camera/focusTweenDuration.ts` and
must keep agreeing on the same duration by construction, not by a shared
value read once. If either side ever needs a duration that isn't the single
module constant (e.g. a per-move duration), the two computations can
disagree: the loop stops ticking before the ease saturates (the camera
freezes mid-approach) or keeps ticking after it saturates (wasted frames).

This is the "subsystems never wake themselves" convention
(`project_render_wake_consolidation`) stretched rather than followed: instead
of the driver setting a presence flag the selector can check, the wake logic
reaches into the driver's private clock fields and re-derives "is this thing
still animating" from a duration constant it doesn't own.

## Why now

A spec for perceptually-uniform focus moves (a van Wijk & Nuij geodesic
replacing the independently-eased yaw/pitch/distance channels) is scoped to
the `tween`/`clip` descriptor path only, so it won't touch `followBody`.
Approaching a followed body will keep the old per-channel lerp and read
differently from every other focus move once that spec ships. That is the
trigger for filing this now; the entanglement stands on its own regardless.

## Directions to explore (design decides)

- Port `followBody` onto `evaluateClip` by giving it a real
  `CameraTweenDescriptor`, so it shares the same ease (and, later, the same
  geodesic) as `tween`/`clip`, and gains a normal presence-flag wake term.
- Give `followBody` its own descriptor-shaped state without going through
  `evaluateClip` — keep the driver split from `tween`/`clip` (it has a moving
  target, unlike a plain tween) but still expose a presence flag instead of a
  duration-coupled predicate.
- Leave it split, deliberately: `followBody`'s target moves every frame
  (`livePos`), which `evaluateClip`'s descriptors don't model today, so
  folding it in may cost more than the divergence it fixes.

No option is obviously right without checking what `evaluateClip` would have
to grow to host a moving target — hence `needs-design`, not `ready`.

## Related

`src/services/engine/camera/cameraDrivers.ts`,
`src/services/engine/camera/cameraClock.ts`,
`src/services/engine/camera/focusTweenDuration.ts`,
`src/services/engine/helpers/shouldKeepTicking.ts`,
`src/state/camera/selectors.ts`.
