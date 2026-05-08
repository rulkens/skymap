# ADR 0004 — Camera rotation during tour legs

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** Alexander Rulkens (project lead), with input from the cosmic-zoom plan working group

## Context

The Powers-of-Ten tour drives the camera through nine shells as one continuous, cinematic motion (~103 s). Between any two adjacent `ShellBeat`s, the camera must move from the previous beat's exit waypoint to the next beat's entry waypoint. Each waypoint specifies both a **position** *and* a **lookAt** target (see [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §3 for the `CameraWaypoint` type). The lookAt point typically moves by a non-trivial angular distance between adjacent beats — for example, beat 4 (Local Group) frames the Milky Way and M31 together, while beat 5 (Local Sheet) reframes onto the supergalactic plane from a vantage tens of Mpc out. The angle between these two lookAt vectors, as seen from the moving camera, is large enough that *how* the camera re-aims during the leg becomes a visible, load-bearing aesthetic decision.

The brainstorm at [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) flagged this as Q1 ("Camera rotation during a fly leg") and left it unresolved. It also noted a subtler requirement: **non-tour** camera tweens (the `#target=` deep-link flow) must *not* re-aim the camera during their flight, because user-initiated navigation expects the orbit camera's existing semantics (the target moves; the eye orbits to maintain the same relative framing). The two code paths therefore need different orientation behaviour.

This ADR resolves the open question. It is the canonical reference for §12-Q1 of [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md), which states the conclusion in passing; this document records *why*.

## Decision

**During every tour fly leg, the camera's forward direction smoothly slerps from the previous waypoint's lookAt direction to the next waypoint's lookAt direction over the leg's eased `t`.** The slerp shares the same easing curve as the position interpolation, so position and orientation move together as one cinematic gesture — there is no separate "look-around" phase before or after the dolly.

Concretely, for a leg from `prevWaypoint` to `nextWaypoint` over duration `D` with easing `f`:

1. Compute forward vectors `f_prev = normalize(prevWaypoint.lookAt − prevWaypoint.position)` and `f_next = normalize(nextWaypoint.lookAt − nextWaypoint.position)`.
2. At wall-clock offset `dt`, eased progress `e = f(dt / D)` ∈ [0, 1].
3. Interpolate position linearly: `pos = lerp(prevWaypoint.position, nextWaypoint.position, e)`.
4. Slerp the forward unit vectors on the unit sphere: `fwd = slerp(f_prev, f_next, e)`.
5. Derive yaw and pitch from `fwd` (see `src/utils/math/yawPitchFromDirection.ts`) and write them onto the `OrbitCamera`.

The tour engine implements this implicitly by reusing the existing `cameraTween` primitive. Because `cameraTween` already interpolates yaw and pitch independently with the same eased `t`, and because skymap's camera never rolls (roll is always 0), the per-channel yaw + pitch interpolation is mathematically equivalent to a constrained slerp of the forward vector on the unit sphere. See [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §15 for the exact `tweenFromWaypoint()` derivation.

The non-tour `cameraTween` flow is unchanged: it still interpolates target/distance/yaw/pitch independently with the same easing, but its callers (the `#target=` flow) typically pass `fromYaw == toYaw` and `fromPitch == toPitch`, so the orientation is held while the orbit target translates. The two behaviours coexist because the *waypoint → tween* conversion lives in the tour engine, not in `cameraTween` itself.

## Alternatives considered

**(a) Snap-rotate, then dolly.** At the start of each leg, instantly re-aim the camera to look at `nextWaypoint.lookAt`, then dolly the position over the leg duration with no further rotation. Simple to implement; trivially testable. **Rejected** because it produces a visible jolt at every beat boundary — the very thing Principle 3 ("Continuity through the cuts") forbids. On legs where the lookAt direction changes by tens of degrees (every transition past shell 4), the snap is unmissable and reads as a hard cut, which contradicts the cinematic premise.

**(b) Hand-tuned cinematic curve per leg.** Author a bespoke orientation curve (Bezier on the unit sphere, or a keyframed arc) for each of the ten beat boundaries. Maximum control; potentially the most beautiful result. **Rejected** because it fights the minimal-feature scope: ten boundaries × per-boundary tuning is an authoring burden that only pays off if a cinematographer is iterating on the tour, and the v1 deliverable is "a tour that ships," not "a tour that wins awards." It also breaks the script's *pure-data* property — `ShellBeat` becomes function-valued — which kills serialisability and snapshot testing (see [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §2 for why pure data matters). Future work can add a per-leg `orientationOverride?: OrientationCurve` field as an opt-in escape hatch without breaking this ADR.

**(c) Slerp coupled with eased position (chosen).** The camera turns its head as it walks. The slow start and slow finish of `easeInOutCubic` apply to both translation and rotation, so the gesture feels physically coherent — like a camera operator on a dolly, not a robot arm with two independent servos. This is the canonical 3D rotation interpolation; SLERP is named "spherical linear interpolation" precisely because it is the constant-angular-velocity geodesic on the rotation sphere, and constant-angular-velocity reads as "natural" to the eye.

## Consequences

**Engineering:**
- The tour engine must compute the entry waypoint's effective `from` orientation by reading the *previous* beat's exit waypoint (or, for beat 0, the user's current camera state at tour-start). This is straightforward: the engine maintains a pointer to the active beat and can look back one slot in the script array.
- `tweenFromWaypoint()` (defined in [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §15) is the single conversion site. Every tour leg flows through it, so the slerp behaviour is implemented exactly once.
- Pause/resume re-ease is a `cameraTween` from the user's nudged camera state back to the snapshotted pre-pause state. Because that snapshot includes yaw and pitch, the re-ease automatically slerps the orientation back too — no separate code path needed.
- The slerp is defined only when `f_prev` and `f_next` are not antiparallel. For the tour script we hand-author, this is never the case (no adjacent beats look in opposite directions). A defensive `assert` at script-load time catches authoring mistakes; the runtime does not need to handle the antipodal case.

**Authoring:**
- Script authors think in terms of "where is the camera" and "what is it looking at" per beat. They do *not* author orientation curves, FoV ramps, or roll. This is intentional — keeping the authoring surface tiny is what lets us write nine shells of camera work without it becoming a separate craft.
- If a future beat *needs* a non-slerp orientation (the script's canonical example would be a beat where the camera arcs around a subject while keeping it framed — covered today by the `arc` `InternalMotion`, not by the leg), it should be split into two beats with the same `shellId`, each leg slerping. Compound orientation behaviour within a single leg is explicitly out of scope.

**Testing:**
- A camera-mutation test asserts that at `t=0.5` of a leg with `easeInOutCubic`, the camera's yaw is exactly halfway (modulo shortest-arc) between the two waypoints' yaws. See [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §16 — this is one of the named test cases for the tour engine.
- Snapshot tests on the parsed default script catch any beat boundary where `f_prev` and `f_next` would be antipodal, before runtime.

**Aesthetic:**
- The "slow head-turn while flying" is the dominant cinematic gesture of the tour. It is the difference between "the tour" and "a slideshow." Locking it in here, behind a single primitive, means every shell author inherits it for free — they author static waypoints and the engine produces motion.

## References

- [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — full tour-engine spec; §12-Q1 states this conclusion, §15 describes the `tweenFromWaypoint()` conversion that implements it
- [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) — the brainstorm where Q1 was raised; superseded by the spec above
- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — Principle 3 ("Continuity through the cuts") and the visual-identity "slow easing, no overshoot" notes that motivate the slerp choice
- [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) — the per-shell waypoints whose framing the slerp connects
- `src/services/camera/cameraTween.ts` — the existing primitive the tour engine reuses
- `src/utils/math/yawPitchFromDirection.ts` (planned) — the helper that turns a slerped forward vector into orbit-camera channels
