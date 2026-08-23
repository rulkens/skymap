# DESIGN-INPUT — globe-anchored surface camera (what we need to know to implement it)

Synthesis of `cesium-notes.md` (C), `openspace-globebrowsing-notes.md` (O),
`maplibre-kml-notes.md` (M), `skymap-seam-map.md` (S),
`openspace-camera-comparison.md` (X),
`.superpowers/sdd/2026-08-21-earth-surface-navigation/{fw-h-investigation.md, progress.md}` (L),
`docs/grill-sessions/earth-local-slab-2026-08-21.md` (G).

Citations are `C §2.4`-style into those files. This document is decision input for a grill
session and then a spec; it is not a plan.

**Binding given** (PLAN.md USER CONSTRAINT): body-related navigation state lives in a local
body-fixed km/m frame. World-Mpc appears only at the regime boundary and in render composition.
Not weighed below — assumed.

**Premise correction, verified this pass.** The seam map and the research brief both name a
"SpaceMouse 6-DoF stream" as a live input source. It does not exist: the whole subsystem was
deleted (`docs/superpowers/plans/completed/2026-06-16-remove-spacemouse-subsystem.md`);
`src/services/input/` contains only `createKeyboardListener.ts`. What survives, deliberately, is
the `CameraDriver` registry (tween 60, autoRotate 20) with the priority-100 input driver slot
vacated. §5 designs the seam that slot needs; it does not design for a device that is not there.

---

## 1. STATE VECTOR

### 1.1 The proposal

```ts
// Authoritative while the surface regime is engaged. Nothing else is stored.
type SurfaceCameraState = {
  bodyId: BodyId; // whose body-fixed frame this is expressed in — the ONE discriminant
  eyeLocalKm: Vec3; // body-centred, body-FIXED axes, km, f64
  basisLocal: Mat3; // right | up | forward as columns, body-fixed, orthonormal
};
```

Per-gesture, not persistent (dies at pointerup):

```ts
type SurfaceGesture = {
  mode: 'pan' | 'trackball' | 'strafe' | 'look' | 'tilt' | 'zoom'; // latched at gesture start
  anchorRadiusKm: number; // |first pick| — the frozen pan sphere       C §2.3
  anchorLocalKm?: Vec3; // body-fixed; NEVER world                    C landmine #5
  prevPixel: Vec2; // previous FRAME's end, not the press point  C §2.1
};
```

Derived on read, every frame, never stored:

- `P` — the surface point under the screen centre (ray ∩ body in body-fixed km; fallback: the
  nadir point below the eye).
- `ENU(P)` — `up = P̂` (geodetic normal once an ellipsoid arrives), `east = normalize(ẑ_body × up)`,
  `north = up × east`. `ẑ_body` is the spin axis and is **time-independent in this frame** — the
  whole `[EF]` hazard list (C "where the globe doesn't move is hiding") is about Cesium hardcoding
  the ECEF Z axis in a world frame where the body moves. Body-fixed storage makes items 1, 3, 4, 5
  and 7 of that list unreachable rather than handled.
- `heading, tilt, range, altitude, lonLat` — KML `LookAt` semantics (M §1) evaluated in `ENU(P)`.

### 1.2 Stored vs derived — the four choices, and which side skymap takes

| Choice                     | Cesium                                                                 | OpenSpace                                                              | KML/Google                                                            | skymap                    |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| Pose vs angles as storage  | pose (`position/direction/up/right`), HPR derived on read (C §1.1-1.2) | pose (`dvec3 + dquat` world), surface basis derived per frame (O §1.2) | angles (`lon/lat/alt + heading/tilt/range`) as the wire format (M §1) | **pose**                  |
| Frame the pose lives in    | world = ECEF, i.e. body-fixed by accident (C §1.1)                     | absolute world doubles (O §5)                                          | body-fixed geodetic                                                   | **body-fixed km** (given) |
| Where HPR is measured      | ENU of the **camera's own subpoint** (C §1.2)                          | nadir at the camera's ground point (O §1.2)                            | ENU of the **target** (M §1)                                          | **ENU of the target**     |
| A persistent target/anchor | none — anchor is per-gesture controller state (C §1.1)                 | anchor is a _node id_, pose untouched by anchor change (O §1.1)        | the target IS the state                                               | **none persistent**       |

**Why pose, not angles.** All three core operators are rigid motions: drag = rotation of the pose
about the body centre; tilt = rotation of the pose about an axis through `P`; zoom = a scaling of
`eye − anchor`. On `(eyeLocalKm, basisLocal)` each is exact, closed, and ~8 lines. On
`(target, range, heading, tilt)` each needs a transport correction — rotating the target moves
`ENU(P)`, so heading must be parallel-transported through the same rotation or the view twists.
That correction-on-a-parameterization is structurally the same shape as `surfaceDragRotation`'s
Newton solve, `groundTrackingRadPerPixel`'s rate law, and FW-G's R̃: the family that produced nine
fix waves (L). MapLibre reaches the same verdict from the other end — its authoritative state is
the globe's **orientation quaternion**, with bearing/pitch as derived views (M §Deltas 2).

**Why HPR at the target, not the subpoint (against Cesium).** Cesium measures HPR at the camera's
own subpoint because it has no target to measure against (C §1.2). skymap's surface regime is
target-anchored by definition — every gesture is _about_ a ground point — so KML's convention is
both cheaper and the one that makes the re-levelling trick (§2c) mean "keep my tilt relative to
the ground I'm looking at" rather than "relative to the ground I'm over". Note the read is not
free: it is two cross products plus three `atan2`s. Derive once per frame, pass it down; do not
re-read it inside a loop (C "Do NOT copy: reading `camera.heading` on a hot path").

**Why no persistent target.** FW-H's proven root cause is a stored pivot that accumulates
unboundedly (`followPanStored`, `cameraClock.ts:226-238`; offset ≈ `altitude · tan(off-axis angle)`
at every scale, measured ratio 0.163 across 10 decades — L fw-h-investigation). Cesium has no
persistent target and therefore cannot have that bug; OpenSpace's anchor is an identifier, and
changing it leaves the pose untouched (O §1.1). Deriving `P` per frame from the screen centre makes
"where am I looking" a _view_ of the pose, not a second state that can disagree with it.

**Why no stored roll.** KML `LookAt` has no roll because target + range + heading + tilt fully
constrain the camera (M §1); `<Camera>` has roll precisely because it drops the target. skymap's
pose storage _can_ hold roll (it is a full basis), and rigid operators preserve it exactly. The
question is not whether the surface regime can hold roll — it is whether the **world-orbit**
regime can receive it at the boundary. See §3 and open decision 4.

---

## 2. CORE ALGORITHMS

All pseudocode runs in body-fixed km, f64. `raySphere` = `src/utils/math/raySphereRoots.ts`
(already reformulated to `discr = r² − |perp|²` by FW-H; survives the pivot, and in km its
arguments stop being pathological).

### (a) 1:1 drag — frozen pick sphere, two-ray rotation

```
onGestureStart(px):                                            # C §2.2, §2.3
  hit = raySphere(rayLocal(px), origin=0, R_body)
  if !hit:  mode = (altitude > trackballBand ? 'trackball' : 'look'); return
  anchorRadiusKm = |pointAt(hit.tNear)|      # FREEZE a sphere, not a point   C §6.2
  mode = 'pan'

onFrame(prevPx, px):                          # prevPx = LAST FRAME's end     C §2.1
  if mode != 'pan': dispatch(mode); return
  if |eyeLocalKm| < anchorRadiusKm: return    # camera fell below the sphere  C §6.3
  p0 = raySphere(rayLocal(prevPx), 0, anchorRadiusKm)
  p1 = raySphere(rayLocal(px),     0, anchorRadiusKm)
  if !p0 || !p1: mode = 'trackball'; return   # sticky for the gesture        C §2.6, §6.1
  axis = normalize(p̂0 × p̂1); ang = acos(clamp(p̂0·p̂1, -1, 1))
  if ang < EPS or |axis| ~ 0: return
  q = quat(axis, -ang)                         # carry p0 to p1 under the cursor
  eyeLocalKm = q · eyeLocalKm ; basisLocal = q · basisLocal   # position AND basis   C §2.4
```

Provenance and the point of it: C §2.4 (`pan3D`'s default branch), C "Copy: the `p0 × p1` drag
rotation … ~8 lines, pole-free, exact, identical at every latitude". MapLibre's
`versorSetLocationAtPoint` is the same solve with the quaternion applied to the _globe's_
orientation instead of the camera's (M §2a) — mathematically the conjugate. skymap must apply it
to the camera: the body's orientation is owned by the ephemeris/orientation table and input must
never write it.

Three claims that follow structurally, not by tuning:

- **No `cos(latitude)` term exists to be wrong.** The cos-lat bug (S; fixed as interim by FW-I) is
  Cesium's legacy `constrainedAxis` path preserved as a non-default branch (C §2.4) — do not port
  it. OpenSpace never has the bug for the same reason: "latitude is an output, never a coordinate"
  (O §3.3).
- **No pole case.** Dragging over the pole is an ordinary rotation with a near-equatorial axis
  (C §2.5). MapLibre's `fixedBearingLongitude` "dial" band inside ~12° of a pole (M §2a) is a
  _bearing-preservation_ nicety for a north-up map, not a singularity fix. skymap has no north-up
  constraint in the surface regime → do not port (open decision 9).
- **MapLibre's `getZoomAdjustment` cos-lat zoom nudge (M §2b) does not apply.** It corrects a
  Mercator zoom _scalar_; skymap's currency is `range` in km, which is already latitude-neutral.

Grazing incidence: when `|ray·normal| < 0.05` at the pick, a 1-px cursor move maps to kilometres of
surface and a rotation is a teleport — **strafe** (translate by `anchor − thisFrameIntersection` in
the plane through the anchor with the view direction as normal) instead of rotating (C §2.8, §6.4).

### (b) Zoom-to-cursor, with the FW-H direction asymmetry

```
onZoom(factor, cursorPx):                       # factor < 1 = zoom in
  # TWO different points, and they must stay separate:                       C §3.1
  dMeasure = |centreSurfaceHit − eyeLocalKm|  ?? altitudeKm     # from screen CENTRE
  approaching = factor < 1
  minRange = approaching ? MIN_RANGE_KM * clamp(|ê·f̂|, 0.25, 1) : 0
                                        # tilt-scaled floor, ONE-SIDED   C §3.2 / PR #9932
  step = clamp(ZOOM_K * (dMeasure − minRange), MIN_RATE, MAX_RATE) * ratio   # geometric

  if approaching and (a = raySphere(rayLocal(cursorPx), 0, R_body)):
      eyeLocalKm = a + factor * (eyeLocalKm − a)           # converge ON the cursor anchor
  else:
      c = bodyAxisPointFor(eyeLocalKm)                     # on-axis / centre-directed
      eyeLocalKm = c + factor * (eyeLocalKm − c)           # zero lateral, altitude taper
  clampAltitude(); reapply(headingBefore, tiltBefore) at the NEW ENU(P)      # C §3.4
```

- **The direction branch is the FW-H fix, and it is geometric, not a storage artefact.** On
  zoom-out the cursor anchor is a _repelling_ fixed point: the pivot translates by
  `(factor−1)·perp(eye − anchor)` per notch and `|eye − anchor| ≈ altitude`, so the offset is
  `altitude · tan(off-axis angle)` at **every** scale (L fw-h-investigation; measured ratio 0.163
  across 10 decades; 260 notches out + 260 in with the cursor unmoved ends `1.082e11 km` off). The
  pivot deletes the accumulator (`followPanStored`) but not the repelling fixed point — keep the
  branch. The spec always said so: _"reverts cleanly to centre-directed zoom on zoom-out and on a
  cursor miss"_ (completed spec §74).
- Cesium does not hit this because (i) it has no stored pivot and (ii) Regime B actively rotates
  the anchor _toward_ screen centre as you pull out (C §3.3). Regime B is the optional way to buy
  the same convergence with the anchor still live on zoom-out — worth knowing, not worth
  implementing first (C "Do NOT copy: the `handleZoom` SCENE3D block as written").
- **Separating the distance measure (screen centre) from the anchor (cursor) is why Cesium's zoom
  neither lurches nor loses the anchor** (C §3.1, "Copy" list). skymap's `cursorZoomStep.ts:64-75`
  currently mixes reference points on the miss branch — length from `eyeAltitudeMpc`, direction
  from `target − position` — which is FW-H's secondary contributor 2. The separation above fixes
  it by construction.
- **Overshoot guard**: if the step crosses the anchor's tangent plane, the arc math flips the
  camera to the far side — early-return and force a fresh anchor pick next frame
  (C §6.7; PR #4967 "Emergency brakes for runaway camera zoom", PR #4982 "Auto-reset the zoom after
  zooming past a target", both v1.31).
- **Collision guard**: gate on _closing distance_, not altitude. Cesium's original absolute-height
  gate let fast inertial zooms tunnel through tall geometry; the fix (issue #11107 → PR #11108)
  changed the "about to collide" signal to the **previous frame's pick distance**. C's own note:
  "an altitude gate cannot predict a collision, a closing-distance gate can."
- **Ground-height low-pass**: with a streaming virtual-texture Earth, every LOD refinement moves
  the reported ground height and teleports the camera. Only apply a ground-driven height push when
  the height has been stable across frames (`|Δ| ≤ 10 %`), and **bypass the smoothing whenever the
  user moved the camera this frame** (C §6.5; issue #11824 → PR #11837, v1.115). C calls this
  "the single most transferable idea in the file for any streaming-terrain camera". skymap has the
  exact problem and does not have the mitigation.

### (c) Tilt about a surface point, with a clamp Cesium does not have

```
onTiltStart(centrePx): C = raySphere(rayLocal(centrePx), 0, R_body) ?? grazingPoint(); latch C
                                                                    # C §4.2, sticky C §6.1
onTiltFrame(dx, dy):
  (E, N, U) = ENU(C)
  (headingNow, tiltNow) = derive(eyeLocalKm, basisLocal, C)
  heading' = headingNow + K_H * dx
  tilt'    = clamp(tiltNow + K_T * dy, 0, maxTilt(altitudeKm / R_body))    # <-- DESIGNED, see below
  rotate (eyeLocalKm, basisLocal) about (C, U) by Δheading                 # horizontal: about the anchor
  rotate (eyeLocalKm, basisLocal) about (C, E') by Δtilt                   # vertical: about the post-heading east
  collisionFloor(); if the floor moved the eye, rotate basisLocal by the same angle/axis  # C §6.6
```

- Cesium's whole trick is `_setTransform` into `ENU(C)` and reusing the ordinary trackball with
  `constrainedAxis = local UP` (C §4.2). Under body-fixed pose storage that becomes a plain
  change-of-basis with no save/restore dance — the reason the frame swap is cheap here and
  invasive there.
- The KML composition order is load-bearing: heading about local Z, **then** tilt about the
  _already-yawed_ X, then (if any) roll about Z again — an intrinsic Z-X-Z sequence in the local
  ENU, not rotations about fixed world axes (M §1, M §Deltas 6). Implementing tilt about a fixed
  axis silently diverges at any non-zero heading.
- Below the picking floor, Cesium splits the two axes across **two** ENU frames — horizontal about
  the point you grabbed, vertical about the point at the same screen height in the centre column —
  specifically to stop a near-ground tilt sliding sideways (C §4.3). Worth knowing; only needed
  once terrain-height picks exist.

**The tilt clamp is a design gap, not a port.** Cesium's `maximumTiltAngle` defaults to
`undefined` — _"the angle of the camera tilt is unrestricted"_ — and its only real limiters are
emergent (flip guards, height floor, collision) (C §4.4; C "Do NOT copy: `maximumTiltAngle` as a
constant … don't look here for it"). Google Maps has the behaviour and publishes **no formula
anywhere**: the docs state that the allowed range "varies with the current zoom level" and that
`getTilt()` may not return what `setTilt()` was given, and confirm no numeric table exists in any
Google-published page (M §3). So this is a UX target to tune, not a constant to copy.

Proposed shape, with the parameters explicitly open:

```
maxTilt(h/R) = TILT_MAX * smoothstep(HI, LO, h/R)      # 1 at h/R ≤ LO, 0 at h/R ≥ HI
   TILT_MAX ≈ 80–85°     LO ≈ 0.001 R (≈6 km over Earth)     HI ≈ 0.05 R (≈320 km)
```

Express every threshold as a fraction of body radius from the start (C "Do NOT copy: the three
altitude constants as absolute metres"). `HI` deliberately lands near the regime band (§3), which
buys the roll-free boundary crossing argued in §3.

**Settle-to-top-down comes free from HPR-recapture-per-zoom-step.** Capture `(heading, tilt)`
before each zoom step and re-apply after it (C §3.4; issue #4639 → PR #5603, v1.38, changelog
"Zoom now maintains camera heading, pitch, and roll"). Because HPR is defined in the ENU of a
target that the zoom just moved, re-applying **re-levels against the new local vertical** every
step: a camera at −30° keeps 30° of tilt rather than drifting toward the horizon. Compose that
with a `maxTilt` that shrinks as you pull out and the camera _converges_ to top-down on zoom-out
with no auto-untilt tween anywhere. Cesium has no explicit untilt either; the feel is emergent
from exactly these two mechanisms (C §3.4).

### (d) Heading / tilt definition and pole handling

- **heading** = azimuth from local north at `ENU(P)`, 0 = north, increasing eastward (M §1 for the
  convention, C §1.2 for the formula: `atan2(dir.y, dir.x) − π/2`, then `2π − zeroToTwoPi(·)`).
- **tilt** = angle from local nadir at `P` (KML: 0 = straight down, M §1). Cesium's `pitch` is the
  complementary form (0 = horizontal, −π/2 = down, C §1.2) — pick one, write it in the type name,
  and never carry both.
- **The view-direction singularity is the common case, not an edge case.** Looking straight down —
  the _default_ globe view — makes `dir.x, dir.y ≈ 0` and `atan2` garbage. Cesium's escape: take
  the azimuth from the **up** vector's horizontal components instead, and define roll = 0, inside
  `|dir.z| within EPSILON3 (~0.0014 rad)` of vertical (C §1.2, C §6.9). Adopt verbatim. C's own
  warning: _"Any camera that stores heading rather than deriving it has to solve this at write time
  instead."_ — a second, independent argument for §1's pose-not-angles verdict.
- **The geographic-pole singularity** (`east` undefined on the axis) touches only the _readout_ and
  the _tilt gesture_, never drag (C §2.5). Cesium picks a hardcoded fallback frame within
  `EPSILON14` of the axis (C §1.4). Recommended skymap variant: within `|û·ẑ_body| > 1 − 1e-12`,
  take `east` from the camera's own right vector projected tangentially — continuous with the
  approach direction, so the readout does not jump as you fly over the pole — and report heading 0
  by convention.

---

## 3. THE HANDOFF (world-Mpc orbit ↔ body-fixed km surface)

None of the three references solves this. Cesium's world frame _is_ Earth-fixed, so the question
cannot arise (C §1.1). OpenSpace's answer is "there is no handoff" — one `{dvec3, dquat}` in
absolute world doubles from interstellar range to 10 m, with surface-relativity entering as a
per-frame _basis_ (O headline, O §1.2). MapLibre does have a hard swap (globe ↔ mercator transform
classes behind one `ITransform`, masked by a `globeness` shader blend) and it is a genuinely
different implementation, not a re-parameterization (M §2c, M §Deltas 10) — the closest structural
analogue, and its lesson is: budget for two code paths behind one interface plus a continuous
blend factor masking the seam.

### 3.1 What must be continuous, and what may snap

**Exactly continuous, by construction (not by tween):**

```
eyeWorldMpc  = bodyPosMpc(t) + R_body(t) · eyeLocalKm  · SCALE_UNITS.KM_TO_n
basisWorld   =                 R_body(t) · basisLocal
```

This is a lossless change of coordinates. If both regimes derive the render pose through one
conversion, then eye position, view direction, up/roll and FOV are continuous _because they are the
same numbers_. This is precisely Cesium's `_setTransform`: snapshot the world pose, swap the frame,
re-express — "changing the frame therefore never moves the camera" (C §1.1). Adopt the property,
not the mutable-state implementation.

**May snap, and should:** in-flight coast/inertia (if it ever exists), gesture mode, sensitivity
constants, and the derived heading/tilt readout at the instant of the flip. OpenSpace's anchor
change hard-_zeroes_ all five velocity axes (`setImmediate(0)`, not damped) and snaps the
follow-rotation interpolator to 0 or 1, while leaving the pose untouched (O §1.1). Adopt: crossing
the boundary cancels any coast; it never tweens the pose.

**The one thing that cannot be made continuous by pose math — what is held fixed.** In the
world-orbit regime the camera is inertially placed and the ground rotates under it (drift `ω·r`);
in the surface regime the ground is nailed and the sky sweeps. The crossing flips which one moves.
Options:

|        | Mechanism                                                                                                                                                                               | Cost                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | Hard flip at the threshold — do nothing                                                                                                                                                 | Visible only as the onset/cessation of drift. At the FW-E band this is ≈3 px/s at real-time rate — imperceptible; at 1000× sim rate, blatant |
| **H2** | Ramp the _co-rotation rate_ over ~1 s with a signed smoothstep, i.e. OpenSpace's `interpolateRotationDifferential` applied to the derivative of the frame map, not to the pose (O §2.3) | +1 continuous state; pose stays exactly continuous either way                                                                                |
| **H3** | Expose it as a user "lock to ground" toggle                                                                                                                                             | Rejected — knob proliferation is OpenSpace's own named failure (#3537 pt 5, X §2)                                                            |

**Recommendation: H1 first, measure under an accelerated clock, spend H2 only on adverse evidence.**
Same ruling shape X §3(b) reached for FW-G's disengage ("land it, look at it, and only then spend
the change"), and the same code-is-liability rule.

### 3.2 Engage / disengage criteria

- **Keep the FW-E derivation.** The existing band (120.372 / 240.744 km) comes from a _perceptual_
  currency — 3 / 1.5 px/s of on-screen ground drift at idle posture (L, FW-E). X §3(b) rates that
  strictly better than OpenSpace's `boundingSphere × 5.0`, which is what broke for the Apollo 8
  capsule case (#3017), and C rates absolute-metre constants a do-not-copy.
- **Re-express it as `h/R`, not km.** 120.4 / 240.7 km over Earth = **0.0189 / 0.0378 R**. One
  number, body-independent, Earth-calibrated — the FW-E derivation still fixes the value. This
  also generalizes for free when a second body gets a surface (which the slab grill Q2 explicitly
  deferred as a data problem, G Q2).
- **Angular size is nearly degenerate with `h/R` here** (Earth subtends ~78° angular radius at
  120 km, ~76° at 241 km) — no reason to introduce a second currency.
- **What the threshold now gates is much bigger than before.** Under FW-G it gated a _correction_
  applied to a world pose; under the pivot it gates _which frame the authoritative state lives in_.
  Keep the 2× hysteresis, and add a second, temporal hysteresis: **the regime must not flip during
  an active gesture** — latch at gesture start, re-evaluate at gesture end. Cesium's sticky
  per-gesture mode latch is the same instinct at a smaller scale (C §6.1, "Re-deciding the mode
  mid-drag makes the camera oscillate"); FW-C's mid-drag wheel guard and FW-D's gesture-scoped
  fallback latch were both groping toward this rule without stating it.
- **One state, one consumer.** The regime boolean feeds the frame provider and nothing else. Not a
  render path, not a drag mode, not a serialization frame. This is X §4 item 4 (OpenSpace #3017,
  and their live re-offence at `navigationhandler.cpp:460-463` where follow-rotation state picks
  the serialization frame). Write the test that asserts the single consumer.

### 3.3 The rotating-frame fold

- **Entering: capture nothing.** `eyeLocalKm = R_body(t)ᵀ · (eyeWorldMpc − bodyPosMpc(t)) / KM_TO_n`.
  No snapshot, no epoch. FW-G's `orientationAtEngage` and `R̃(t) = R(t)·R(t₀)⁻¹` disappear: R̃ was a
  _derived stand-in for having the state in the rotating frame_. With the state actually there,
  R̃ ≡ identity by construction. **This is the pivot's largest single deletion** — co-rotation stops
  being a mechanism and becomes a property of the storage.
- **Leaving: bake the rotation into the world pose.** `eyeWorldMpc`/`basisWorld` by the formulas
  above, then re-derive the world-orbit parameterization from them. This _is_ FW-G's disengage
  fold, and it is now exact rather than a correction resolved at a chosen point.
- **Two FW-G properties survive conceptually and must be carried as requirements:**
  1. **Derived, never integrated.** OpenSpace's position co-rotation is a per-frame Riemann sum
     (O §2.2, `:726-730`), which is why their #3026 jitters under increased delta-time and why they
     pause the clock for every camera path (O §2.4). skymap's accelerated clock is that regime
     permanently — X §3(b): _"the derived form must stay, and there is no third option."_ An exact
     per-frame frame conversion is the derived form in its cleanest possible shape.
  2. **Fold last.** The conversion must run _below_ driver arbitration, after every pose writer for
     the frame — FW-G review round-1 major finding 1 was exactly "commit-on-edge discards the fold,
     last writer wins, wrong one" (L 2026-08-23). Generalizes to: the frame conversion is the final
     stage of the frame's camera pipeline, and it has exactly one site.
- **What does NOT survive, and why it matters.** FW-G's disengage roll tween, its ~0.06° roll floor
  and its documented-not-fixed "residual up-roll: accept" fallback all existed because the fold
  landed into a **yaw/pitch** parameterization that cannot represent roll. Under a full-pose
  conversion roll is carried exactly _into_ the world regime — but only if the world regime can hold
  it. Three ways out, and they are not equivalent (open decision 4):
  - (i) accept a roll residual on leaving — **no**, that is the same bug wearing the pivot's coat;
  - (ii) give the world-orbit camera an explicit roll/up degree of freedom — honest, +1 field,
    touches XR and tour authoring;
  - (iii) **let the tilt clamp do it**: with `HI` (§2c) sited at the disengage band, tilt is already
    driven to ~0 by the time the boundary is crossed, so the outgoing pose is near-nadir and
    roll-free, and `heading` maps exactly onto `yaw`. **Recommended** — it costs nothing, it is
    the Google feel, and it turns a correctness problem into a consequence of a feel decision.

### 3.4 Where the transform lives

The slab grill already sited this: an **anchor-relative camera-pose provider seam**, with two
providers — (A) derive an Earth-relative pose from the heliocentric f64 camera, and (B) a natively
Earth-fixed km f64 pose — the same value at the flip, different source of truth (G Q1). The grill's
structural insight is load-bearing here: _"A is not a stepping stone B replaces — B keeps A"_, since
on approach from deep space the camera is heliocentric regardless. **The pivot IS provider B, and it
lands exactly where the grill said it should** ("land (B) inside Plan 2 where its real motivation —
navigation semantics — lives"). Ratify G Q1 and Q3 as part of the pivot spec rather than resuming
the slab grill in parallel.

Shape: one `renderCameraOf(state, t) → {eyeMpc, basisWorld}` and its inverse at the boundary; one
call site each. From the input side, Cesium's own proposed replacement architecture puts the same
seam in the same place (C §6.14, issue #13473) — see §5.

### 3.5 The accelerated sim clock

OpenSpace force-pauses simulation time for every camera path — _"to aovid problem with objects
moving"_ [sic] — and calls it out as their sharpest camera debt (O §2.4, `pathnavigator.cpp:372`).
skymap cannot; skymap's "clip pins clock" landmine is the same workaround arrived at independently.

**What must be true so a fast clock never moves the ground under a surface-regime camera: the stored
state must be independent of `t`.** It is — iff nothing in the surface regime reads a world
position. Concretely:

1. Drag / zoom / tilt solves run entirely in body-fixed km. (Free under the pivot.)
2. The per-gesture anchor is stored body-fixed. Cesium stores every anchor in world space
   (`_rotateStartPosition`, `_tiltCenter`, `_zoomWorldPosition`, `_strafeStartPosition`,
   `_panLastWorldPosition`) and C flags this as _"the single highest-risk port: a drag that lasts
   2 s at 15°/hr moves the anchor ~125 m at the equator"_ (C landmine #5). Free under the pivot;
   still worth a test.
3. Inertia/coast, if it ever exists, replays in the body-fixed frame — i.e. the coast is
   ground-fixed. C landmine #6: _"Cesium has no opinion because the question can't arise. Pick one
   and write it down."_ Written down: ground-fixed.
4. `R_body(t)` is sampled **once per frame** and the same sample feeds the camera conversion and the
   rendered body. Two call sites at different `t` is a sub-frame ground slide.
5. **The gap the pivot does not close**: tour/clip/tween drivers still interpolate endpoints in
   absolute Mpc. That is X §4 item 2 — _"precision-relativity stops at the renderer and does not
   reach the tween/clip/serialization paths, exactly the mistake OpenSpace made and has had open
   since #2305"_ — and it re-enters the surface regime through the driver table if the seam is not
   shaped for it. Call it out in the spec; see open decision 10.

### 3.6 Zoom-through-the-boundary UX

- **Inbound (space → ground).** The tilt clamp opens as `h/R` falls; the camera arrives top-down
  with tilt freedom newly available. The crossing itself is silent — **no re-centre, no re-level, no
  tween**, because the pose is literally unchanged. The only observable is the ground stopping its
  drift.
- **Outbound (ground → space).** The clamp closes over the last decade of altitude, HPR-recapture
  re-levels every zoom step (§2c), roll goes to zero, and the boundary receives a near-nadir pose.
  This is the Google "settles to top-down" feel and the fix for §3.3's roll residual, in one
  mechanism.
- **The other outbound path is drag, not zoom.** Dragging at high altitude with the cursor off the
  limb is Cesium's `pan3D` → `rotate3D` sticky degradation (C §2.6) — a _gesture_ mode change, not a
  regime change. Under the §3.2 rule the regime cannot flip mid-gesture, so this stays contained.
- Cesium's mode ladder is worth copying wholesale for the surface regime's internals: **the control
  model is chosen by what the cursor is over, with altitude only as a tiebreak** — cursor hits the
  body → anchored pan at _any_ altitude; cursor misses and high → trackball; cursor misses and low →
  free-look (C §5.1). Separately, **the surface representation** (analytic sphere vs terrain/depth
  pick) is chosen by altitude. C: _"control model chosen by what you grabbed, surface representation
  chosen by altitude — the cleanest idea in the file."_ It gives a controller with no zoom-level
  state machine, which matters across skymap's range.

---

## 4. PRECISION MODEL

| Regime             | Units            | Magnitude           | f64 ulp                     | Note                                              |
| ------------------ | ---------------- | ------------------- | --------------------------- | ------------------------------------------------- | ------------------------ | ------------------------------------------- |
| Surface            | body-fixed km    | `R_earth` = 6371 km | ≈1.4e-12 km ≈ **1.4 nm**    | G Q3 quotes ~0.7 nm (2⁻⁵³ convention); same order |
| World orbit        | heliocentric Mpc | 1 AU = 4.85e-12 Mpc | ≈1e-27 Mpc ≈ **tens of µm** | G Q1 quotes ~14 µm                                |
| Today's drag solve | Mpc              | —                   | residual floor ≈ `eps·      | centre                                            | /altitude` ≈ **1e-6 px** | S; FW-I interim: tol 1e-3 px + best-iterate |

Readings:

- The surface floor is set by the **magnitude of the anchor** (`R_body`), not by how close the
  camera is to the ground — this is the same statement `rebaseViewProj`'s docblock makes for the GPU
  side ("the number that kills precision is how far the eye and the anchor are from the origin the
  vp was built around — not how close the camera is to the anchor"). At 1.7 m eye height the
  camera-relative vector is ~1.7e-3 km and its own ulp is irrelevant. G Q3's success criterion
  (rock-solid at 1.7 m, headroom proven to ~µm) is met with ~6 decades to spare.
- **The drag-solve conditioning problem dissolves, twice over.** The achievable residual becomes
  `eps·R/h`, negligible at every altitude — and the solve itself is deleted in favour of the
  closed-form two-ray rotation (§2a). Two carry-forwards die with it: FW-I's loosened tolerance, and
  FW-D's reviewer finding that the exact cursor-lock solve is _unavailable below ~0.4 body radii_
  (~1900–3200 km over Earth) at RTC magnitudes (L).
- **The Mpc↔km conversion happens exactly once per frame, at the provider seam**, through
  `SCALE_UNITS.KM_TO_n` (`src/data/scaleUnits.ts` — the repo has no `kmToMpc`/`MPC_PER_KM` helper;
  this is the single existing constant). Requirement: no other module in the surface path multiplies
  or divides by it. One grep test.
- **RTC render path**: the NEAR0 slab already rebases the vp to the eye and narrows to f32 after
  the rebase. The pivot's body-fixed km pose is exactly provider (B) that the Earth-local slab wants
  (G Q1), so the slab becomes "one more row, not a new code path" (`slabs.ts` docblock) consuming a
  pose that is _already_ local — instead of the ad-hoc `rebaseViewProj` + narrow it survives on
  today (G pre-session context).
- **The GPU twin of the same unit problem** is the WESL Mpc-magnitude denormal flush (black nadir
  disc, S; memory: WESL landmines). Near-surface values ~1e-21 Mpc sit in f32's denormal range; km
  puts them in f32's comfort zone (G pre-session context). Requirement: the surface slab's uniforms
  carry km, and narrowing happens after the rebase, never before.
- **The CPU twin already fixed**: `raySphereRoots`' discriminant reformulated as `r² − |perp|²`
  because the textbook `b² − (|m|²−r²)` put `|m|²` 17 decades above `r²` and turned clean hits into
  misses (FW-H contributor 1; docblock in the file). Keep the reformulated form — in km it stops
  being critical but stays correct, and it is now the shared primitive for pick _and_ drag.

---

## 5. INPUT INTEGRATION

**Adopt Cesium's own proposed replacement architecture, as the starting point rather than the
destination.** Cesium has declared `ScreenSpaceCameraController.js` unmaintainable (C §6.14, issue
#13473 "Extensible camera controller architecture"): _"Rather than immediately mutating camera state
during input events, controllers may aggregate input state and apply updates during the render/update
loop."_ C's verdict: _"the algorithms are worth copying and the architecture is not — that is
Cesium's own position."_ The aggregate-then-apply shape is also what dissolves their five mode flags
and the `_setTransform` save/restore dance, and it is the natural home for both the frame conversion
and any future 6-DoF stream.

Against skymap's seam (S):

| Today                                                                                                                                               | Under the pivot                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `orbitControls.ts` (729 lines) mutates `OrbitCamera` inside DOM handlers (`:520-566` exact branch, `:552-557` apply, `:584-599` flat-rate fallback) | becomes a **pure gesture recognizer**: emits `{kind, startPixel, prevPixel, pixel, factor, buttons}`; mutates nothing                  |
| pointermove handled synchronously, one apply per event                                                                                              | a per-frame **aggregator** collapses all moves since the last frame into one `{startPosition, endPosition}` (C §2.1)                   |
| `wireInput.ts:425-451` builds the frame, `:475`/`:485-504` routes zoom + lateral into clock state                                                   | a `surfaceController` consumes `(aggregatedGesture, SurfaceCameraState)` and **returns a new pose**; `wireInput` only routes           |
| pose written by several drivers, corrected later at a resolution point (`runFrame.ts:494-499, 601-606, 645-663`)                                    | **one application point**, below driver arbitration, immediately before the frame conversion (§3.3 "fold last")                        |
| five-ish latent mode conditions spread across branches                                                                                              | one `gestureMode` tagged union, latched at gesture start (C §6.1 for the latch; C "Do NOT copy: five parallel booleans" for the shape) |

Consequences worth stating:

- **Aggregation removes a bug class, not just a line count.** FW-D's mechanism M3 (mid-drag zoom
  tick desyncs the register eye from the rendered target) and the "two-camera family" defects — the
  848 km standing bias, the register-vs-render divergence during long drags (L) — are all
  _ordering_ artefacts of mutating pose from multiple event handlers between frames. One pose, one
  writer, one apply per frame is the structural cure.
- **The `CameraDriver` registry is where the input controller belongs**, in the priority-100 slot
  the SpaceMouse driver vacated (the removal plan explicitly preserved `runCameraDrivers`,
  `buildCameraDrivers`, the `CameraDriver` type and the wake gate for this reason). A future 6-DoF
  device then supplies **pose deltas in the camera's own local frame**; C flags exactly this as
  needing "the same frame decision at their integration point" — under the pivot that decision is
  answered once, at the seam, because the camera's local frame is already body-fixed.
- **`orbitControls`' hard-won DOM knowledge stays untouched**: pointer-events over mouse-events,
  `pointermove`/`up`/`cancel` bound to `window` (drag-outside continuation + the iOS Safari implicit
  pointer-capture bug), `touch-action: none`, and `WHEEL_GESTURE_GAP_MS = 150` for trackpad momentum.
  That is the part of the file worth keeping verbatim.
- **Inertia: default NO.** skymap has none, and X §3(c) ruled AVOID on a velocity/friction model
  (per-axis state that every transition must reset; OpenSpace's #2779/#3380 are the receipts).
  Cesium's form is the cheap one — flick-only (≤400 ms hold), replay a _synthetic_ movement through
  the same action so the frozen anchor survives the coast, and cross-cancel between gesture types
  (C §2.9) — with no persistent velocity. Open decision 8.

---

## 6. WHAT DIES / WHAT SURVIVES

### Dies

| Thing                                                                                                                                                                             | Site (S / L)                                             | Why it goes                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `followPanStored` + `followPanWorld`/`addFollowPan` accessors + the frame-tag conversion convention (7 compose sites)                                                             | `cameraClock.ts:226-238`; FW-G's "one designed impurity" | no persistent target exists (§1.2)                                                     |
| target pin `= bodyPosition + followPanWorld(...)`                                                                                                                                 | `applyFocusedBodyPivot.ts:53-58`                         | the surface regime has no world-space target                                           |
| `surfaceFollowCorotation` / `orientationAtEngage` / R̃ / disengage fold / roll tween / 0.06° roll floor                                                                            | `runFrame.ts:494-499, 601-606, 645-663`                  | co-rotation becomes a property of the storage, not a mechanism (§3.3)                  |
| `surfaceDragRotation.ts` — Newton solve, tol `:37`, bound `:141-149`, accept `:163-173`                                                                                           | 237 lines                                                | replaced by ~8 lines of two-ray rotation (§2a)                                         |
| flat-rate fallback + `groundTrackingRadPerPixel.ts`; the ground branch of `orbitRadPerPixel.ts`                                                                                   | `orbitControls.ts:584-599`                               | the cos-lat-era rate law and the limb currency alternation (FW-D M1) have no successor |
| FW-D constants: `MAX_SOLVE_RATE_MULT=6` (and its implicit 80.4° pitch ceiling), `MIN_SOLVE_STEP_PX`, `RESIDUAL_TOL_PX`, gesture-scoped fallback latch, nearest-branch yaw re-base |                                                          | all artefacts of the deleted solve                                                     |
| FW-I's interim `tol 1e-3 px` + best-iterate escape                                                                                                                                |                                                          | conditioning fixed at the source (§4)                                                  |
| `PITCH_LIMIT` clamp-after-accept coupling on the drag path                                                                                                                        |                                                          | replaced by an explicit tilt clamp (§2c)                                               |
| cos-lat-era tests: `surfaceDragLatitudeGain` traces, T3 drag-exactness fixtures, `zoomOutPivotDrift` mechanism assertions                                                         |                                                          | mechanism-level; their _behaviours_ re-enter as requirements below                     |

### Survives

- `raySphereRoots.ts` with its FW-H discriminant reformulation — now the shared primitive for pick
  **and** drag; the single most-reused thing in the pivot.
- `cursorRayFromCamera` / `cursorRayWorld` / `cursorSurfaceHit` (already transposes into the body-
  local frame — half-way there) and the hover-pick path `wireInput.ts:291-326` →
  `state.picking.hoveredSurfacePoint`.
- The entire RTC render path: `rebaseViewProj`, `computeForegroundViewProj`, `foregroundFrustum`,
  the NEAR0/COSMO slab table. Unchanged — it receives a better-conditioned pose (§4).
- `clampDistance` envelope, `pitchLimit`, `surfaceStandoffRadii` — re-priced, not deleted. (Carry
  the backlog-grade `MIN_DISTANCE_MPC ≈ 309 km` wall over sub-309-km-radius bodies, L.)
- `CameraDriver` registry, `runCameraDrivers`, the wake gate.
- `orbitControls`' DOM layer knowledge (§5).
- The FW-E perceptual threshold derivation (3 / 1.5 px/s → the `h/R` band).
- `SCALE_UNITS.KM_TO_n`.

### Becomes a requirement carried forward (one line per wave)

- **FW-A** — every altitude read is EYE-based (`|eye| − R`), never pivot- or target-derived.
- **FW-B** — zoom is stateless per tick: `eye′ = anchor + factor·(eye − anchor)`; no bias state
  anywhere.
- **FW-C** — a trackpad inertial burst must not register as a new gesture, and must not slide the
  view at rest.
- **FW-D** — a gesture's rate currency must not alternate frame-to-frame across the limb, and per-
  event step magnitude is bounded.
- **FW-E** — surface behaviour engages while ground drift is still perceptible (≈3 px/s), not at
  metres.
- **FW-F** — while engaged the ground stays pinned: no residual `ω × r` slide of the tracked point.
- **FW-G** — the rendered sightline and the interaction register are the SAME pose (one resolution
  point), and the frame conversion runs below driver arbitration.
- **FW-H** — zoom-out never anchors on the cursor; a zoom-out-then-in round trip with the cursor
  unmoved returns to the starting view.
- **FW-I** — drag tracking is sub-pixel exact at every latitude and altitude, with no best-iterate
  escape hatch.

---

## 7. OPEN DECISIONS FOR THE GRILL

1. **One camera state or two regimes?** (a) Two regimes + one lossless conversion at a provider
   seam; (b) one always-anchor-relative state (OpenSpace's answer, O headline — but their route to
   it is a scene graph the comparison rejected as their-scope, X §3(d)); (c) status quo + corrections
   (nine fix waves of evidence against). **Rec: (a).** The GIVEN forces body-fixed near the body;
   heliocentric Mpc is right everywhere else; the conversion is exact and one-sited.
2. **Storage: pose+basis, or `(target, range, heading, tilt)`?** **Rec: pose+basis in body-fixed km,
   KML fields derived at the target's ENU** (§1.2). The counter-case is that Google/KML semantics are
   the product spec, so storing them removes a derivation — real, but it re-introduces transport
   corrections on every operator.
3. **Is the target persistent state or derived per frame?** **Rec: derived** — a stored pivot is
   FW-H's proven root cause (L). Counter-case: a persistent target makes "focus lock" trivial.
4. **Roll across the boundary**: (i) accept a residual on leaving; (ii) add roll/up to the world-
   orbit camera; (iii) let the tilt clamp force ~0 tilt at the band so the crossing is roll-free.
   **Rec: (iii)** — free, and it is the Google feel (§3.3).
5. **Tilt clamp curve.** `TILT_MAX`, `LO`, `HI` in `h/R`, and the interpolation shape. **Rec:
   smoothstep, `TILT_MAX ≈ 80–85°`, `LO ≈ 0.001 R`, `HI ≈ 0.05 R`** (siting `HI` at the regime band
   is what buys decision 4). Explicitly a feel parameter — **no published reference exists** (M §3).
6. **Regime discriminant + hysteresis.** **Rec: `h/R` band 0.0189 / 0.0378 (the FW-E values), one
   boolean, exactly one consumer, plus "no flip during an active gesture."** Alternative: angular
   size — nearly degenerate near Earth, so it buys nothing today.
7. **Co-rotation-rate handoff: hard flip (H1) or signed-smoothstep rate blend (H2)?** **Rec: H1,
   then measure under an accelerated clock; H2 only on adverse evidence** (§3.1).
8. **Inertia/coast: none, or Cesium's flick-only form?** **Rec: none for the first landing**; if
   added, flick-only with a synthetic-movement replay and cross-cancel (C §2.9), never a persistent
   velocity model (X §3(c)).
9. **Port MapLibre's pole "dial" band?** **Rec: no** — it preserves bearing for a north-up map, a
   constraint skymap does not have (M §2a). Revisit only if the heading readout near the pole is
   complained about.
10. **Tour/clip/tween endpoints near a body: leave in absolute Mpc, or express body-relative in this
    pivot?** **Rec: out of scope for the first implementation, in scope for the seam's shape** — the
    conversion must be a call-site change later, not a redesign. This is X §4 item 2, the
    highest-expected-value prediction in the corpus, and the pivot does not fix it for free (§3.5.5).

---

## 8. RISKS & LANDMINES

**Cesium's Earth-fixed assumption list (C "where the globe doesn't move is hiding"), mapped.**
Items 1 (`eastNorthUpToFixedFrame` hardcodes the ECEF Z axis), 3 (`camera.rotate` about the world
origin), 4 (`|position|` as an altitude proxy in three rate laws), 5 (world-space anchors go stale
within a frame) and 7 (cartographic height only exists in the Earth-fixed frame) are **dissolved**
by body-fixed storage — they become unreachable, not handled. Two remain live and need answers
written down: **item 2** — a stored HPR's meaning drifts on a rotating Earth, so state explicitly
that skymap's HPR is frozen in the _co-rotating_ ENU (it is, by construction, once the pose is
body-fixed); **item 6** — an inertia coast must be either ground-fixed or inertial (answered §3.5.3:
ground-fixed).

**The anchored-frame-disables-controls failure mode (C §5.3).** In Cesium, setting
`camera.transform ≠ IDENTITY` — which is exactly their documented recipe for viewing in an inertial
frame — switches off the _entire_ anchored control set: no 1:1 drag, no tilt, no zoom anchor; you
get a trackball and nothing else. **This is skymap's FW-F/FW-G architecture in one sentence**: a
surface regime implemented as a _correction applied to a world camera_ degrades every anchored
control the same way, which is why nine fix waves each fixed one control and broke the next. It is
the reason the pivot is a pivot rather than a tenth wave.

**OpenSpace's quaternion-order landmine (O §2.1).** They store `R_prev · R_cur⁻¹` — the _inverse_ of
the body's forward increment — and it is correct only because glm's `v * q` means `inverse(q) * v`.
Two of three consumers use `v * q`, the third uses an explicit `inverse(diff) *`. A reader "fixing"
one of them breaks co-rotation silently, and only near a rotating body. skymap's twin is
`wgpu-matrix`'s dst-last/column conventions (a standing landmine). Mitigation: one conversion helper,
one site, and a test with a **tilted pole** — FW-F's reviewer used exactly that and got 3.1e-16
agreement against ground truth (L).

**MapLibre's horizon-blend caveat (M §2b, M §Deltas 5).** Exact "point stays under cursor" zoom has
no solution when the target is over the visible horizon, so they _fade to a heuristic centre_ rather
than erroring. skymap's twin is a cursor anchor at grazing incidence near the limb. Cesium's answer
is a hard test rather than a blend: `|ray·normal| < 0.05` → strafe (C §6.4), plus the
`direction · position̂ ≥ −0.5` gate under 1000 km (PR #9126 "zoom stuck when looking up"; 90° is
theoretically correct but "doesn't behave well when parallel to the earth surface", so 120° was
chosen empirically). **Adopt the tests; do not adopt a blend** — a blend is a second parallel path.

**Streaming-terrain teleport (C §6.5, #11824 → PR #11837).** skymap's virtual-texture Earth has this
exactly and has no mitigation. Low-pass the ground height (only act when stable within 10 % across
frames) and **bypass the low-pass whenever user input moved the camera** — the smoothing exists to
reject _data_-driven height changes, never user-driven ones. A stuck-underground-near-cliffs edge
case was knowingly left open by Cesium; expect the same.

**Collision-floor ordering (O §4, two named traps).** (1) OpenSpace's terrain floor lives _inside_
the zoom branch, so disabling zoom silently disables the floor — one state deciding two things
again. (2) Their height sample is one step stale: the handle is computed before the vertical
translate and the clamp uses the pre-move value, so a fast dive samples terrain from where it
started. Requirements: the floor is unconditional, and it resamples after the last position write.

**Sensitivity must never read DEM height** (X §4 item 3, OpenSpace #2150: "when you just graze a
feature, you nearly come to a complete halt"; their escape hatch `_constantVelocityFlight` is
defaulted the wrong way). Reference radius only, for sensitivity; DEM height only for the collision
floor. Zero LOC, one comment, written before terrain exists.

**One state deciding two things** (X §4 item 4). The regime boolean feeds the frame provider and
nothing else — not a render path, not a drag mode, not a serialization frame. OpenSpace re-committed
this exact sin at `navigationhandler.cpp:460-463` after being burned by it in #3017.

**The serialization boundary is where architectural precision safety fails** (O §5). OpenSpace's
nav-state round trip has been admitted-wrong since 2023 (`navigationstate.cpp:226`, "Only works if
the reference frame is also the anchor node"). skymap's URL hash is the same boundary and is already
a known landmine. A surface-regime pose serialized as absolute Mpc throws away everything the pivot
bought — the serialized form must name its frame.

**Smaller, cheap, add them:** clamp step _magnitude_, not just the positive side (C §6.15 — Cesium's
`Math.min(ratio, max)` leaves fast negative deltas unclamped, and it looks like an oversight); force
a fresh anchor pick after a zoom overshoots its target (C §6.7); NaN guards on frame construction
and on decayed inertia values, all three of which Cesium added after the fact (C §6.12); rotate the
orientation by the same angle/axis that a collision push moved the position, or the view jerks on
every hill (C §6.6).

**And the meta-risk.** OpenSpace's own verdict on their camera is #3537 point 5 — 26 property blocks
in one file, "utilizing the full potential of the system currently requires knowledge about all the
different settings" — with a shipped workaround standing in for a root fix (roll disabled by default
because of "fast unexpected rotations"). Cesium's is #13473. **The pivot must land with fewer
constants and fewer concepts than the nine fix waves accumulated, or it has not been paid for.**
