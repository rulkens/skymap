# Camera pivot — design (spec 2)

> **Status.** Drafted 2026-09-01 as one of two adversarial variants (the Fable
> variant is merged into this file and deleted; git history keeps it). T2 and
> R1 RULED 2026-09-01 (see §12); remaining open at spec review: packaging (§2)
> and feel constants.
> **Date.** 2026-09-01.
> **Ruling record.** [`docs/grill-sessions/globe-camera-pivot-2026-08-24.md`](../../grill-sessions/globe-camera-pivot-2026-08-24.md).
> Decisions below cite it (`ruled, Q6`) rather than re-arguing. Where the
> transcript diverges from
> [`DESIGN-INPUT.md`](../../research/2026-08-24-camera-pivot/DESIGN-INPUT.md),
> the transcript wins.
> **Spec 2 of two.** Spec 1 —
> [body render slabs](completed/2026-08-25-body-render-slabs.md), shipped as
> PR #634 — built the `BodyPoseProvider` seam and put every body's rendering in
> its own metre frame behind it. This spec swaps provider B in behind that seam
> and does not change the renderer (ruled, Q1b, S1).

## 1. What we're building

Near a body, the authoritative camera state stops being the heliocentric Mpc
orbit camera and becomes a **body-fixed, anchor-relative pose in SI metres**
(ruled, Q1-A, S2, S3). Google-Earth navigation follows from that storage rather
than from corrections applied on top of a world camera: the ground under the
cursor stays under the cursor, the horizon stays level at every latitude, the
sky is reachable, and a fast sim clock cannot slide the ground, because nothing
in the engaged path reads a world position.

The state vector the product speaks — **standpoint, heading, tilt, range** — is
the derived readout, evaluated in the target's ENU with KML `LookAt` semantics.
What is _stored_ is the pose and its basis (ruled, Q2-A). The probe's
"heading must be camera state" finding
([probe-findings.md](../../research/2026-08-24-camera-pivot/probe-findings.md)
§Net input) is satisfied strictly more generally by a stored basis: heading is
one component of an orientation the camera owns, so nadir is continuous, the
horizon is level, and no consumer re-derives an up vector from frame-global
state.

Two regimes, one lossless conversion, one site (ruled, Q1-A). Outside the band
the incumbent Mpc orbit camera is unchanged. The crossing never moves the
camera, because both sides derive the render pose from the same numbers.

### Why now

**The seam is built and has exactly one shape of consumer.** Spec 1 shipped
`BodyPoseProvider` with provider A behind it and the whole body-rendering path
in metres. Provider B is a second implementation of a type that already exists,
selected at one line in `frameContext.ts:224-228`.

**The incumbent parameterization fails at joints, not at values.** The
tilt/look probe measured 90° of horizon roll looking east from the frame
equator, an unreachable sky over the frame equator, and a fold at the frame
pole — all three the same missing camera-owned basis, none of them patchable
where they show (probe defects 1–3). Nine fix waves on the same
correction-on-a-parameterization family are the other half of that evidence
(PR #623, closed unmerged).

**Deep zoom is a state problem now, not a renderer problem.** Spec 1 made the
render frame metre-native; the camera is what still quantizes. With the anchor
in the state vector (ruled, S2) the state-side floor shrinks with zoom instead
of sitting at Earth-radius magnitude, and the remaining frontier is data.

### Goals

- One authoritative camera state at a time, in a named frame; the arm tag is
  the only regime discriminant in the design (ruled, Q6 "one state, one
  consumer").
- Engage/disengage is exact: eye, sightline, screen-up and FOV are the same
  numbers on both sides (ruled, Q1-A; DESIGN-INPUT §3.1).
- Anchored gestures — 1:1 drag, cursor zoom, tilt about a ground point,
  free-look — in body-fixed metres, closed-form, with no solve and no
  per-latitude or per-pole case (ruled, Q2-A, Q9).
- Tours, clips and serialized poses name their frame (ruled, Q10, Q10b).
- Fewer constants and fewer concepts than the nine fix waves accumulated
  (DESIGN-INPUT §8, the meta-risk).

### Non-goals

- **Inertia / coast** — none in this landing (ruled, Q8). If it is ever added
  the only acceptable shape is Cesium's flick-only synthetic replay, and it
  replays in the **body-fixed frame** (written now, zero LOC).
- **MapLibre's pole "dial" band** (ruled, Q9: no).
- **Terrain-height collision, DEM-driven sensitivity, and the streaming-height
  low-pass.** skymap's bodies are analytic spheroids; the Earth tile pipeline
  streams imagery, not elevation, so there is no reported ground height for a
  camera to chase. The requirements are recorded in §6 as written-down rules so
  a future DEM cannot arrive frame-blind.
- **XR and 6-DoF devices.** No XR path on main; the SpaceMouse subsystem was
  deleted and is not returning. §7's aggregator is where such a stream would
  land; nothing is built for it.
- **The renderer.** No slab, layer, shader or tile-planner change. If this spec
  produces a renderer diff, something is wrong with it.
- **Lowering the descent floor.** Re-anchoring is built and tested so the floor
  becomes a constant rather than an architectural limit; the floor itself moves
  when content justifies it (§10).

## 2. Ground preparation

Refactor-ground ran over the whole pivot on 2026-08-24/25. Its prep — P1
`SlabFrame` discriminant, P2 `frameProgram` builder, P3 step-level depth
load-op, P4 `M_TO_MPC` + `radiusM` migration (PR #635) — plus spec 1 itself
(#634) prepared the **renderer** side. Judged against the code as it stands on
`9250245f8`, two camera-side joints are missing and are prep; everything else
in this spec is growth.

The gesture math needs no new primitives: `quatFromAxisAngle`,
`multiplyQuat`, `rotateVec3ByQuat`, `mat3FromColumns`, `normalize3`, `cross3`,
`smoothstep` and `raySphereRoots` (with its FW-H discriminant reformulation)
are all present and are composed, not replaced.

**P5 — `roll` on the pose currency.** `OrbitCameraInit.roll` exists and
`computeViewProj` honours it (`computeViewProj.ts:99,110`), but `CameraPose` —
the currency every driver, keyframe and commit speaks — has no roll field, and
nothing in `src/` sets one. §12-R1 shows the disengage conversion needs exactly
that one degree of freedom to stay lossless. Adding it is a pure additive
field, default 0, threaded through `poseOf` / `assembleOrbitCamera` /
`reencodePose` / the clip evaluator's pass-through, with no behaviour change
while every producer leaves it at 0. Doing it inside the feature commits would
braid "the pose grew a field" with "the camera grew an arm" in one diff.

**P6 — input: recognizer, aggregator, one apply point.** `orbitControls.ts`
mutates the `state.cam` register inside DOM handlers, one apply per event
(`orbitControls.ts:466-478`, `seedCameraFromBase.ts`). A surface controller
added beside that becomes a second input path writing a second register — the
parallel-path smell, and the ordering artefact behind FW-D's mid-drag desync
and the register-vs-render divergence. The prep splits the file along the line
DESIGN-INPUT §5 draws: `orbitControls` becomes a pure **gesture recognizer**
(it keeps its hard-won DOM knowledge — pointer events, `window`-bound
move/up/cancel for the iOS implicit-capture bug, `touch-action: none` — and
mutates nothing; FW-C's trackpad-burst handling is feature work for the
surface controller, not prep); a per-frame **aggregator** collapses every move
since the last frame into one `{startPixel, endPixel}` (C §2.1) and drains it
at one apply point in the frame loop — `drainInput`, at the top of `runFrame`,
above the driver table's `getState()` — that replaces orbitControls' own
per-event register mutation. As landed (PR #648), the incumbent orbit math
still mutates the OrbitCamera register at that single drain rather than
returning a pose — the returns-pose shape is deferred to this spec's surface
controller / provider B.
Behaviour-preserving, and it is the joint both arms plug into.

**Packaging is an open ask at the checkpoint, as always: do P5 and P6 land as
their own PR off `main` before the feature commits, or ride this spec's PR?**
No default. (Spec 1's prep landed as a separate PR; that is precedent, not a
rule.)

## 3. Data delta

```ts
// src/@types/camera/PoseFrame.d.ts
/** The frame a stored or authored camera pose is expressed in (ruled, Q10). */
export type PoseFrame = 'absolute' | { readonly body: BodyId };
```

```ts
// src/@types/camera/BodyFixedPose.d.ts
/**
 * The camera in one body's FIXED axes, SI metres, f64 — anchor-relative so the
 * stored magnitudes shrink with zoom instead of sitting at body-radius scale.
 */
export type BodyFixedPose = {
  readonly bodyId: BodyId;
  /** Body-fixed anchor point, metres. `[0,0,0]` = body centre (ruled, S2). */
  readonly anchorLocalM: Vec3;
  /** Eye − anchor, body-fixed axes, metres. */
  readonly eyeRelAnchorM: Vec3;
  /** right | up | forward as columns, body-fixed axes, orthonormal. */
  readonly basisLocal: Mat3;
};
```

```ts
// src/@types/camera/FramedCameraPose.d.ts
/**
 * The authoritative camera pose and the frame it lives in. The `absolute` arm
 * is today's orbit currency unchanged; the `body` arm is provider B's state.
 * This is the tag-beside-channels form T4 ruled for — NOT the declined
 * FramedPose rewrite of the animation system, which keeps its four channels.
 */
export type FramedCameraPose =
  | { readonly frame: 'absolute'; readonly pose: CameraPose }
  | { readonly frame: { readonly body: BodyId }; readonly pose: BodyFixedPose };
```

```ts
// src/@types/camera/CameraPose.d.ts  (delta, P5)
export type CameraPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  /** Roll about the view axis, radians. Optional, absent ⇒ 0 (see §12-R1). */
  roll?: number;
};

// src/@types/camera/CameraState.d.ts  (delta)
export type CameraState = {
  base: FramedCameraPose; // was CameraPose
  // …unchanged
};
```

```ts
// src/@types/camera/SurfaceReadout.d.ts
/**
 * KML LookAt semantics at the ENU of the point under the screen centre.
 * `tiltRad` is measured from local NADIR (0 = straight down, π = zenith) —
 * never Cesium's complementary pitch; the datum is in the field name because
 * carrying both conventions is how they get mixed (DESIGN-INPUT §2d).
 */
export type SurfaceReadout = {
  readonly standpoint: LonLatDeg;
  readonly headingRad: number;
  readonly tiltRad: number;
  readonly rangeM: number;
  readonly altitudeM: number;
};
```

```ts
// src/@types/camera/SurfaceGesture.d.ts
/** Per-gesture, latched at gesture start, dead at pointerup (ruled, Q3). */
export type SurfaceGesture = {
  readonly mode: 'pan' | 'trackball' | 'strafe' | 'look' | 'tilt';
  /** |first pick| — the FROZEN pan sphere, body-fixed metres (C §2.3, §6.2). */
  readonly anchorRadiusM: number;
  /** Body-fixed, never world (C landmine #5). */
  readonly anchorLocalM: Vec3 | null;
  /** Previous FRAME's end pixel, not the press point (C §2.1). */
  readonly prevPixel: Vec2;
};
```

```ts
// src/data/camera/surfaceRegime.ts
export const SURFACE_REGIME = {
  /** h/R at which the body arm takes over (ruled, Q6: ~1.7 R ≈ 11,000 km). */
  engageHR: 1.7,
  /** h/R at which it hands back. 2× hysteresis (ruled, Q6). */
  disengageHR: 3.4,
  /** Tilt ceiling at ground level: π = zenith, reached via look mode (Q5). */
  tiltMaxRad: Math.PI,
  /** h/R below which the full ceiling is open. Feel-tunable (Q5). */
  tiltFullHR: 0.02,
} as const;
```

No change to `BodyRelativePose`, `BodyPoseProvider`, `Slab`, `SlabFrame`, or
any layer type. The seam type does not move.

## 4. The regime: a predicate, not a stored flag

The discriminant is `h/R` — eye-based altitude over body radius, body-independent
(ruled, Q6; FW-A: altitude is `|eye| − R`, never pivot-derived). The engaged
body is the one minimizing `h/R` across the bodies the frame resolved; ties
cannot occur at these separations. The predicate reads **geometry only** —
never focus, never the drag mode, never a render path (X §4 item 4).

**There is no regime boolean.** `camera.base.frame` _is_ the regime, so
hysteresis is free and an inconsistent pair is unrepresentable: in the
`absolute` arm the test is `min(h/R) < engageHR`, in a `body` arm it is
`h/R > disengageHR` for that body. This is the strongest available reading of
"one state, one consumer" — the boolean's single consumer was always "which
frame is authoritative", and the frame tag already answers it. The acceptance
test is therefore a grep: no module stores a regime flag (§11).

**No flip during an active gesture** (ruled, Q6): the predicate is skipped while
a gesture is in flight and re-evaluated at gesture end. This subsumes FW-C's
mid-drag wheel guard and FW-D's gesture-scoped latch, which were both groping
toward the rule.

**What flips, and what does not** (ruled, Q7-H1, and DESIGN-INPUT §3.1):

| Continuous by construction           | May snap, and should                     |
| ------------------------------------ | ---------------------------------------- |
| eye, sightline, screen-up, FOV       | gesture mode, sensitivity constants      |
| the rendered image at the flip frame | the derived heading/tilt readout         |
|                                      | which frame is held fixed (H1 hard flip) |

Only the last is observable: outside, the ground drifts under an inertially
placed camera; inside, the ground is nailed and the sky sweeps. At 3.4 R and
real-time rate the onset is far below perception. **H1 ships; the measurement
is an acceptance item under an accelerated clock (§11); H2 — smoothstepping the
co-rotation rate over ~1 s — is the bounded escalation path and is spent only
on adverse evidence** (ruled, Q7).

**The trade, stated for the record:** engaging this high means Earth stops
visibly rotating once engaged — geostationary hover, sun and stars sweep under
a fast clock; "planetarium Earth" lives above the band (ruled, Q6).

## 5. Provider B: the body arm

### 5.1 The two conversions

```ts
// src/services/engine/camera/poseFrameConversion.ts
export function toBodyArm(
  pose: CameraPose,
  projection: CameraProjection,
  bodyId: BodyId,
  bodyState: BodyState,
): BodyFixedPose;

export function toWorldArm(pose: BodyFixedPose, bodyState: BodyState): CameraPose; // carries `roll` — see §12-R1
```

Entering captures nothing: `eyeRel = orientationᵀ · (camPosMpc − bodyPosMpc) ·
MPC_TO_M`, basis through the same rotation. No epoch, no snapshot; FW-G's
`orientationAtEngage` and `R̃(t) = R(t)·R(t₀)⁻¹` have no successor because
co-rotation stops being a mechanism and becomes a property of the storage
(DESIGN-INPUT §3.3 — the pivot's largest conceptual deletion, and the reason
the engaged path cannot be moved by a fast clock).

Leaving bakes the rotation back out: eye and basis to world, then the orbit
parameterization re-derived from them — `target` on the forward axis at the
range to the point under the screen centre, `yaw`/`pitch` from the eye
direction, `distance = |eye − target|`, `roll` from the residual screen-up
rotation. Exact for **any** pose, which is what makes §12-R1's field necessary
and the tilt ceiling a _feel_ mechanism rather than a correctness crutch
(ruled, Q4-iii, refined).

`toWorldArm` is the second module permitted to import `MPC_TO_M` / `M_TO_MPC`
(§10); `bodyRelativePose` remains the first.

### 5.2 The provider

```ts
// frameContext.ts, at the existing seam (frameContext.ts:224-228)
const bodyPose: BodyPoseProvider = (bodyId) =>
  arm.frame !== 'absolute' && arm.frame.body === bodyId
    ? poseFromBodyArm(arm.pose) // provider B — ~nm floor
    : bodyRelativePose({ camPosMpc, camBasisWorld, bodyState }); // provider A
```

**B keeps A** (ruled, S1): every body that is not the engaged one still gets its
pose derived from the heliocentric camera, and on approach from deep space the
camera is heliocentric regardless. Both produce the same value at the flip, to
within provider A's floor — ≈2 ulp at heliocentric magnitude, ≈50 µm at 1 AU —
a unit test asserts it.

`camBasisWorld` at that site is built with roll hard-coded 0
(`frameContext.ts:222`). That is correct today because nothing sets roll; under
P5 it must read `cam.roll ?? 0`, or a rolled world-arm pose renders bodies
un-rolled against a rolled sky. Named here because it is a silent divergence,
not a crash.

### 5.3 Re-anchoring

The floor is set by the magnitude of the stored anchor, not by how close the
camera is to the ground: `ulp(6.37e6 m) ≈ 1 nm`, which stays invisible down to
roughly µm view scale and no further. Re-anchoring moves the anchor toward the
eye and subtracts the same delta, so the pair keeps naming the same point while
both stored magnitudes shrink.

```ts
// src/utils/camera/reanchoredPose.ts
export function reanchoredPose(pose: BodyFixedPose): BodyFixedPose;
```

Contract: the shift is **quantized to the ulp of the anchor's own magnitude**
before it is applied, so both updates are exact — `anchorLocalM + d` rounds to
nothing and `eyeRelAnchorM − d` is exact. Trigger: range below a
magnitude-relative fraction of `|anchorLocalM|`, so the rule is body-independent
and needs no per-body constant. The first landing runs with anchor = body centre
(ruled, S2) and never fires the trigger at the shipped descent floor; the
operation is built and tested now because deep-zoom anchors are wanted now and
the user is not redoing this later.

## 6. Gestures

All of it runs in body-fixed metres, f64, and reads no world position (§4's
fast-clock property). Per-gesture anchors are body-fixed and die at pointerup
(ruled, Q3); there is no persistent target, which is what makes FW-H's proven
root cause — an accumulating stored pivot — unreachable rather than handled.

**The control model is chosen by what the cursor is over; altitude is only a
tiebreak** (C §5.1). Cursor hits the body → anchored pan at any altitude;
cursor misses and high → trackball; cursor misses and low → free-look. The mode
is latched at gesture start and is sticky for the gesture (C §6.1).

New primitive, since no cursor-ray path exists on main:

```ts
// src/utils/camera/cursorRayBodyLocal.ts
/** Ray through a CSS pixel, in body-fixed metres. Built from the basis and
 *  FOV directly — no matrix inverse, so it cannot drift from the slab's vp. */
export function cursorRayBodyLocal(
  pose: BodyFixedPose,
  pixel: Vec2,
  viewportPx: Vec2,
  fovYRad: number,
): { readonly originM: Vec3; readonly dir: Vec3 };
```

**(a) 1:1 drag — frozen pick sphere, two-ray rotation.** Freeze
`anchorRadiusM = |first pick|` at gesture start; each frame intersect the
previous and current cursor rays with _that sphere_ and rotate the pose —
position **and** basis — by the inverse of the quaternion carrying `p̂₀` to `p̂₁`
— the pose rotates _with_ its rays, so the camera turns the other way
(C §2.2-2.4).
Eight lines, pole-free, exact, identical at every latitude. No `cos(latitude)`
term exists to be wrong; dragging over the pole is an ordinary rotation with a
near-equatorial axis. A ray that misses the frozen sphere degrades the gesture
to trackball, stickily (C §2.6). At grazing incidence (`|ray·normal| < 0.05`) a
rotation is a teleport, so the gesture strafes in the plane through the anchor
instead (C §2.8) — a hard test, never MapLibre's blend, which would be a second
path hiding drift.

**(b) Zoom to cursor, direction-asymmetric.** `eye′ = anchor + factor·(eye −
anchor)`: stateless per tick, no accumulator (FW-B). Two points stay separate —
the distance _measure_ comes from the screen centre, the _anchor_ from the
cursor (C §3.1). Approaching with a cursor hit anchors on the cursor;
**zoom-out and cursor misses always fall back to centre-directed** (FW-H): the
cursor anchor is a repelling fixed point on the way out, and the offset it
accumulates is `altitude · tan(off-axis)` at every scale — geometry, not a
storage artefact, so deleting the stored pivot does not delete it. Guards, all
cheap and all evidence-backed: clamp step **magnitude** on both signs (C §6.15);
force a fresh anchor pick after an overshoot past the anchor's tangent plane
(C §6.7); gate the approach on _closing distance_, never on absolute altitude
(C #11107 — an altitude gate cannot predict a collision).

**(c) Tilt about a ground point, and (d) look about the eye.** Two routes under
**one** ceiling (ruled, Q5). Tilt orbits the pose about the latched ground
anchor: heading about the anchor's local up, then tilt about the
_already-yawed_ east — the intrinsic Z-X-Z order KML specifies, which the probe
measured as load-bearing (tilting about a fixed screen axis dragged ~10° of
unwanted heading per 60 px). Its own limit is the collision floor, not a
constant: orbiting past horizontal puts the eye under the surface, and the floor
already forbids that. Look rotates the basis about the eye, which never moves —
this is the only route to the sky, and the probe proved it out (eye and
altitude held to the bit while heading stayed live at full tilt).

**The ceiling.**

```ts
// src/utils/camera/maxTiltRad.ts
export function maxTiltRad(hOverR: number): number; // = tiltMaxRad · smoothstep(disengageHR, tiltFullHR, hOverR)
```

180° at ground level closing smoothly to **exactly 0° at
`SURFACE_REGIME.disengageHR`** — the Q4 identity, one shared constant, one
assertion (`maxTiltRad(disengageHR) === 0`). With the shipped values the curve
crosses 90° at `(disengage + full)/2 ≈ 1.71 R`, i.e. the horizon is reachable
right where the regime engages and the sky opens below that; both are
feel-tunable, no published reference exists for either (M §3).

**Enforcement is orientation-only, applied after every write to the body arm**:
recompute the ENU at the new standpoint and rebuild the basis from
`(heading, min(tilt, maxTilt(h/R)))`. The eye never moves. This is Cesium's
HPR-recapture-per-zoom-step generalized (C §3.4, PR #5603) and it buys three
things at once: a zoom-out re-levels against the new local vertical instead of
drifting toward the horizon; the camera converges to top-down with no untilt
tween anywhere; and the pose reaching the disengage boundary has `tilt = 0`, so
its forward axis points at the body centre and it survives the world regime's
pivot pin unchanged. That last property is what the Q4 invariant actually buys,
and it is why the ceiling's zero must sit exactly at the disengage threshold.

**Written down now, zero LOC** (DESIGN-INPUT §8, C landmines #6, X §4 item 3):
a coast, if one is ever added, replays in the body-fixed frame — ground-fixed,
not inertial. Sensitivity reads the reference radius only; a future DEM height
feeds the collision floor and nothing else. A collision push rotates the basis
by the same angle/axis it moved the eye, or the view jerks on every hill
(C §6.6). The floor is unconditional and resamples after the last position
write (O §4).

## 7. The camera pipeline

One pose, one writer, one apply per frame. Order inside `runFrame`, with the
new steps marked:

1. Aggregate this frame's input into one gesture delta (**P6**).
2. Run the driver table; the winner produces a pose **in the arm it authors**.
   The surface controller occupies the priority-100 slot the SpaceMouse driver
   vacated, and is active only while a gesture is in flight in a body arm.
3. Commit-on-edge, unchanged.
4. Pivot pin — **world arm only**. In a body arm the frame co-rotates with the
   body, so "keep the moving body centred" is structurally satisfied and the
   pin has nothing to do. This is the same deletion as R̃'s, at the driver
   layer.
5. **Evaluate the regime predicate** (§4) on the produced pose, unless a
   gesture is in flight.
6. **Normalize to the resulting arm** — one call to §5.1's conversion pair,
   idempotent when the arms already agree.
7. Assemble the render camera; derive the frame context; render.

Steps 5–6 are the **fold, and they are last** (DESIGN-INPUT §3.3): below driver
arbitration, after every pose writer for the frame, exactly one site. FW-G's
round-1 finding was precisely that a commit-on-edge above the fold discards it
and the wrong writer wins.

Two consequences worth stating. `applyWheelZoom`'s three distance owners
(follow target / spun base / plain base) are a world-arm concern: in a body arm
the wheel routes to §6(b), which owns the range, and the three-way branch is
not consulted. And the follow driver's `isActive` is false in a body arm — its
approach ease and idle hold have no meaning once the state co-rotates.

## 8. Frames for keyframes, tours, and serialization

**Convert now** (ruled, Q10-B): keyframes today interpolate in absolute Mpc,
which is wrong the moment the sim clock moves — the highest-expected-value
prediction in the research corpus (OpenSpace's equivalent, open since 2023).

The animation system keeps its four channels and its `Space` mapping; each
base-layer endpoint (`set` / `setVec`) grows an optional `frame: PoseFrame`,
absent ⇒ `'absolute'` (ruled, T4 — the `FramedPose` rewrite is declined).
Relative writers (`spin`, `rate`, `osc`) act in whatever arm is current and are
untouched. **Interpolation runs in the endpoint's own frame**; a leg whose
endpoints disagree converts its start into the endpoint's frame once, at leg
start, through §5.1. Body-framed channel values are read in that body's
fixed axes, in metres: `target` is a body-fixed point, `distance` is a range,
`yaw`/`pitch` are angles about the body's own axes — a LookAt, decoded to a
`BodyFixedPose` at the driver's exit. Authored keyframes are decoded, never
accumulated, so the pole degeneracy that rules angles out as _state_ (§1) does
not reach them.

Deep-space keyframes stay absolute Mpc and no existing clip changes: the grand
tour's near-body beats already reference ids resolved at play time
(`moveTargetId` / `dollyToId`), which are frame-free by construction.

**Serialization** (ruled, Q10b): the serialized form names its frame; untagged
legacy input parses as `'absolute'`. The URL hash carries **no** camera pose
today — `HASH_PARAM_SOURCES` is `focus`, `t`, `orientation` — so there is
nothing to migrate and no legacy constraint. The deliverable is therefore the
rule plus its one live consumer: `logCameraState`'s debug print names the frame
and prints metres in a body arm. A future `cam` param inherits the tag
requirement from `FramedCameraPose` rather than from prose.

## 9. Consumers that migrate

`selectCameraBase` returns a `FramedCameraPose`; every reader either becomes
frame-aware or reads through a resolved accessor. The inventory, from the
current tree:

| Site                                          | Under the pivot                                       |
| --------------------------------------------- | ----------------------------------------------------- |
| `lonLatFocusPose` + `watchFlyToLonLatSaga`    | authors a **body-arm** pose directly (below)          |
| `cameraDrivers` resting / autoRotate / follow | world-arm authors; follow inactive in a body arm (§7) |
| `cameraDrivers` tween / clip                  | frame-tagged endpoints (§8)                           |
| `applyWheelZoom`                              | world arm only (§7)                                   |
| `applyFocusedBodyPivot`                       | world arm only (§7)                                   |
| scale bar (`runFrame` snap), `focusFraming`   | read the resolved range; the body arm reports metres  |
| `seedCameraFromBase`, `poseOf`                | seed/read the arm, not a bare `CameraPose`            |
| `logCameraState`                              | prints the frame (§8)                                 |

**`lonLatFocusPose` is the deferred item from spec 1** (ledger: "STOPPED per
standing ruling — reaches `CameraPose`/`OrbitCamera` = spec-2 territory"). It
exists to put a body's geodetic point under the camera, and today it does that
by building a local direction, rotating it out to world, and recovering
`(yaw, pitch)` through `orbitAnglesLookingAlong` against the orientation frame —
a body-relative intent expressed as an Mpc round trip. Under the pivot it
becomes a body-arm constructor with no Mpc in it: standpoint from the lon/lat,
range preserved, tilt 0, heading preserved. If the resulting pose is outside the
band, §7's step 6 converts it — the instrument does not need to know. That is
the general rule: **a producer that is body-relative by nature authors a body
arm; the fold is the single site that reconciles.**

## 10. Units, precision, and the one-seam test

SI metres everywhere in the engaged path — state, gestures, readouts — f64 on
the CPU (ruled, S3). Body radii come from the registry's `radiusM` (P4). The
`h/R` currency means no threshold in this spec is an absolute distance (C's
do-not-copy on Cesium's three altitude constants).

| Regime                  | Magnitude           | f64 ulp           |
| ----------------------- | ------------------- | ----------------- |
| body arm, centre anchor | `R⊕` = 6.371e6 m    | ≈1 nm             |
| body arm, re-anchored   | shrinks with zoom   | shrinks with zoom |
| world arm               | 1 AU = 4.85e-12 Mpc | ≈ tens of µm      |

Spec 1's one-seam import test (`oneMpcSeam.test.ts`, 54 assertions) is
**amended, not relaxed**: `poseFrameConversion` joins `bodyRelativePose` as a
permitted importer of `MPC_TO_M` / `M_TO_MPC`, and no other module in the
engaged camera path may import either. The existing three-file cull/fade
allow-list is unchanged.

The descent floor stays where it is for this landing: `SURFACE_STANDOFF_RADII`
re-expressed in metres from the same single declaration, so the two arms cannot
disagree about where the ground is. It is now a constant with content behind it
(the ~10 m f32 near-cancellation in the ocean-glint view vector, which spec 1's
metre migration weakened but did not measure), not an architectural limit —
lowering it is a separate, measurable change.

## 11. Acceptance criteria

**Behavioural — the nine waves, carried forward as tests** (DESIGN-INPUT §6).
Each is a requirement on the engaged arm, and each is one test:

- **FW-A** every altitude read is `|eye| − R`, never pivot- or target-derived.
- **FW-B** zoom is stateless per tick; no bias state anywhere.
- **FW-C** a trackpad inertial burst neither registers as a new gesture nor
  slides the view at rest.
- **FW-D** a gesture's rate currency does not alternate frame-to-frame across
  the limb; per-event step magnitude is bounded on both signs.
- **FW-E** sanity only: ground drift at the flip is imperceptible at real-time
  rate (trivially true at 3.4 R — the perceptual derivation no longer sets the
  band, ruled Q6).
- **FW-F** while engaged the tracked ground point does not slide under an
  accelerated clock: `ω × r` residual is exactly zero, not small.
- **FW-G** the rendered sightline and the interaction register are the same
  pose; the fold runs below driver arbitration at one site.
- **FW-H** zoom-out never anchors on the cursor; 260 notches out and back with
  the cursor unmoved returns to the starting view.
- **FW-I** drag tracking is sub-pixel exact at every latitude and altitude, with
  no best-iterate escape hatch.

**Structural:**

- Engage and disengage are pose-exact: eye, forward and screen-up round-trip to
  within provider A's floor (≈2 ulp at heliocentric magnitude, ≈50 µm at 1 AU),
  over a body with a **tilted pole** and a
  non-identity orientation (the FW-F reviewer's fixture shape; the
  quaternion-order landmine O §2.1 is what it catches).
- `maxTiltRad(SURFACE_REGIME.disengageHR) === 0`, asserted against the record,
  not a literal.
- Grep: no module stores a regime flag; the arm tag is the only discriminant
  (§4). Grep: the amended one-seam test (§10).
- A gesture in flight cannot change the arm.
- `npm test`, `npm run typecheck` green.

**Visual / feel — the user's eyes, dev server, f.lux off:**

1. Descend from 5 R to the descent floor over Earth: no snap at either
   crossing, no ground drift once engaged, the camera settles top-down on the
   way back out with no tween.
2. Drag at 1:1 across the equator, over a pole, and at a grazing limb — the
   grabbed point stays under the cursor; no twist, no teleport.
3. Tilt to the horizon and look to the zenith from ~2 m altitude; heading stays
   live while pinned; the horizon is level at every latitude and azimuth
   (probe defect 3's failing cells: due east from the frame equator, and
   Denmark's latitude).
4. Zoom-out-then-in round trip with the cursor parked off-centre.
5. Accelerated clock at high rate, sitting engaged: the ground is nailed and
   the sun and stars sweep; then cross the boundary and watch the drift onset
   (this is the H1 measurement — adverse evidence, and only adverse evidence,
   buys H2).
6. The same sequence over the Moon and over Mars: nothing in the path is
   Earth-typed.

**Perf.** `npm run perf` before and after, per the `perf` skill, against **this
worktree's own dev-server URL**. The work is CPU-side and small; neutral is the
expectation and the bar. A neutral-or-negative measurement **halts** the
landing pipeline — land/park is the user's ruling, never process momentum.

## 12. Open questions

**T2 — camera state: union, or both states synced? RULED 2026-09-01: the
union.** Deferred to this spec at the refactor-ground checkpoint (transcript
addendum). Both independently written spec variants proposed the union with
the same mirror-state rationale, which is what settled it.

_Proposal: the union_ — `camera.base` becomes `FramedCameraPose` (§3), exactly
one arm authoritative at a time, with §5.1's lossless conversion at §7's fold.

_Rationale._ A synced pair is mirror state: two writers, an ordering rule, and
a "which one is truth" question at every read — the family that produced the
848 km standing bias and the register-vs-render divergence during long drags,
and the shape X §4 item 4 names as OpenSpace's repeated sin. It is also lossy in
the direction that matters: the mirrored world pose quantizes at ~14 µm, so a
µm-scale surface state round-tripping through it every frame throws away exactly
what the pivot bought, and the world arm's clamp envelope, pivot pin and
three-way zoom routing would all act on the mirror and fight the body state.
The union's honest cost is the §9 migration — every reader of `camera.base`
becomes frame-aware — and it is bounded and enumerable, which the mirror's
failure mode is not.

_Alternatives considered._ (a) **Both synced**, above. (b) **One
always-anchor-relative state** (OpenSpace's answer) — ruled out by Q1-A, and
their route to it is a scene graph the research comparison rejected as
out-of-scope. (c) **Union with a narrower body arm** (body-fixed target + angles
rather than pose + basis) — rejected: it reintroduces a pole singularity in the
one frame where the user walks over the pole (probe defect 1).

**R1 — the disengage residual needs `roll`. RULED IN by the user 2026-09-01;
the transcript's mechanism was incomplete.** Q4-iii rules that the tilt
ceiling makes the outbound pose "near-nadir and roll-free by construction, and
`heading` maps exactly onto `yaw`". The first half holds; the second does not.
At nadir the eye's position fixes `yaw` and `pitch` entirely, so `heading` — the
one remaining orientation degree of freedom — appears in the world arm as
**screen roll**, not as yaw. After an anchored drag across the body the
accumulated difference between the camera's screen-up and the frame pole's is
the parallel-transport holonomy, up to 180°. Without somewhere to put it, the
crossing snaps the whole image — which is Q4-i, explicitly rejected.

The minimal completion is Q4-ii's field, and most of it is already paid for:
`OrbitCameraInit.roll` exists and `computeViewProj` honours it; nothing sets
it; XR does not exist; tour authoring is unaffected because the field is
optional and defaults to 0. P5 adds it to `CameraPose`. The tilt ceiling then
does what Q4-iii wanted it to do — deliver a nadir, pin-compatible pose at the
boundary and the settle-to-top-down feel — while exactness comes from the
conversion being lossless for _any_ pose, which is the stronger property Q1-A
asks for.

**R2 — the engaged body is chosen geometrically, never by focus. DECIDED HERE.**
The transcript fixes the band but not which body it applies to. `argmin h/R`
over the frame's resolved bodies keeps the predicate a pure geometric read;
gating on focus would make one state decide two things (pivot _and_ regime),
the exact pattern X §4 item 4 warns about. Consequence: a close unfocused
flyby engages that body's arm. Nothing is visible when it does — the pose is
identical and the ceiling is not applied on entry (R3) — and anchored drag
about the body you are next to is the better behaviour anyway.

**R3 — the ceiling is enforced on driven writes, not on arm entry. DECIDED
HERE.** Enforcing it as an entry clamp would snap a pose that arrives above the
ceiling (a flyby aimed away from the body, a tour keyframe). Since altitude only
changes through zoom, and zoom re-levels through the ceiling (§6), every path
the user can drive still lands at `tilt = 0` by the disengage boundary — the Q4
invariant holds where it is load-bearing without a special case at the seam.

**Small-body engage feel — flagged, not built.** Every planet/moon registry row
can engage (R2's argmin is body-blind); on a ~10 km moon the band engages at
~17 km altitude, which is correct but may feel abrupt. If the feel gate
objects, the remedy is a per-row engage floor — a registry parameter, never a
second regime.

**Known, out of scope.** A tour that ends on a non-body-centred pose while a
body is focused snaps when the resting driver's pivot pin resumes. That is an
incumbent property of the pin, unchanged by this spec, and it is not spec 2's
to fix.

## 13. File inventory (indicative — the plan confirms exact paths)

New:

```
src/@types/camera/PoseFrame.d.ts
src/@types/camera/BodyFixedPose.d.ts
src/@types/camera/FramedCameraPose.d.ts
src/@types/camera/SurfaceReadout.d.ts
src/@types/camera/SurfaceGesture.d.ts
src/data/camera/surfaceRegime.ts
src/services/engine/camera/poseFrameConversion.ts
src/services/engine/camera/regimeArmFor.ts
src/services/camera/surfaceController.ts          (gestures → new body arm)
src/utils/camera/cursorRayBodyLocal.ts
src/utils/camera/anchoredDragRotation.ts
src/utils/camera/anchoredZoomStep.ts
src/utils/camera/maxTiltRad.ts
src/utils/camera/reanchoredPose.ts
src/utils/camera/surfaceReadoutOf.ts
tests/** mirroring the above
```

Modified (prep P5/P6 — packaging per §2):

```
src/@types/camera/CameraPose.d.ts                 (roll)
src/utils/camera/reencodePose.ts
src/services/engine/camera/{poseOf,assembleOrbitCamera}.ts
src/services/camera/orbitControls.ts              (recognizer only)
src/services/engine/frame/runFrame.ts             (P6: per-frame gesture drain — exact site TBD, see §2)
```

Modified (feature):

```
src/@types/camera/CameraState.d.ts                (base: FramedCameraPose)
src/state/camera/{cameraSlice,selectors,logCameraState}.ts
src/services/engine/camera/cameraDrivers.ts       (surface driver; arm-aware isActive)
src/services/engine/frame/runFrame.ts             (steps 5-6, the fold)
src/services/engine/frame/frameContext.ts         (provider B branch; roll at :222)
src/services/engine/camera/applyWheelZoom.ts      (world arm only)
src/services/engine/camera/applyFocusedBodyPivot.ts (world arm only)
src/utils/camera/lonLatFocusPose.ts               (body-arm constructor)
src/state/camera/watchFlyToLonLatSaga.ts
src/@types/animation/CameraAction.d.ts            (frame tag on set/setVec)
src/services/engine/animation/evaluateClip.ts     (per-leg frame conversion)
tests/services/engine/camera/oneMpcSeam.test.ts   (permitted-importer amendment)
```

Untouched: every slab, layer, shader and renderer file; the tile pipeline; the
`.bin` catalog path; `HASH_PARAM_SOURCES`.

## 14. Verification plan

**Unit.** The conversion round trip at Earth, a moon, and a tilted-pole body,
asserting pose exactness and provider A/B agreement at the flip; the anchored
drag rotation against hand-computed two-ray fixtures at the equator, at 80°
latitude, and across the pole; the zoom round trip (260 out, 260 in, cursor
parked) asserting return-to-start; `maxTiltRad` against the invariant and the
90°-crossing; `reanchoredPose` asserting both updates are exact and the named
point is unmoved; the readout's nadir escape (heading from the up vector inside
~0.08° of vertical) and its pole escape.

**Frame-loop.** The fold runs after every pose writer, at one site (assert the
call order, the FW-G finding); a gesture in flight blocks the arm change; the
pin and the follow driver are inert in a body arm.

**Clock.** With the sim clock at high rate and the arm engaged, the tracked
ground point's body-fixed coordinates are bit-identical across frames — the
FW-F requirement stated as an equality, not a tolerance.

**Grep.** No stored regime flag; the amended one-seam importer list; no
`Mpc`-suffixed field carrying metres in the engaged path.

**Then:** `npm run perf` before/after at this worktree's URL, the §11 visual
list with the user, full suite, `/feature-done`.

## References

- [Grill session — globe-camera pivot, 2026-08-24](../../grill-sessions/globe-camera-pivot-2026-08-24.md) — the ruling record; every `(ruled, …)` citation resolves here, including the 2026-08-25 addendum (T1, T2, T4, packaging).
- [`docs/research/2026-08-24-camera-pivot/`](../../research/2026-08-24-camera-pivot/) — `DESIGN-INPUT.md` (`C`/`O`/`M`/`X` citations resolve through its §-refs), `probe-findings.md` (the three defects and the parameterization boundary), `skymap-seam-map.md`.
- [Body render slabs — design (spec 1)](completed/2026-08-25-body-render-slabs.md) §5 (the seam contract), §7.1, §10; and its [execution ledger](../plans/completed/2026-08-26-body-render-slabs.ledger.md) (the `lonLatFocusPose` deferral, the one-seam allow-list ruling).
- [ADR 0010 — continuous per-object floating origin](../../adrs/0010-continuous-floating-origin-for-free-zoom.md) — the anchor-relative lineage §5.3 extends to the camera state.
- `docs/superpowers/conventions/simplicity.md` §7 (the asymmetry STOP signal, applied in §4 and §12-R3); `conventions/plan-style.md` (what the downstream plan takes from §3 and §11).
