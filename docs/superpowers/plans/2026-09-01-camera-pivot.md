# Camera pivot (spec 2) — implementation plan

> **Spec.** [`specs/2026-09-01-camera-pivot.md`](../specs/2026-09-01-camera-pivot.md) — the
> binding authority. Every ruling in it is settled; the plan implements, it does not
> re-open. Rationale for any decision lives in the ruling record
> ([grill session, incl. Addendum 2](../../grill-sessions/globe-camera-pivot-2026-08-24.md)).
> **Execution.** `subagent-driven-development` per
> [`conventions/sdd-execution.md`](../conventions/sdd-execution.md) — task list before
> Task 1, pipelined reviews, ledger archived on Finish.
> **Style.** [`conventions/plan-style.md`](../conventions/plan-style.md) — contract code
> only. Read the current file before editing it; nothing here is a snapshot to copy.

## Ground preparation

**Done — shipped and merged.** P5 (optional `roll` on `CameraPose`, plumbed through
`poseOf` / `assembleOrbitCamera` / `reencodePose` / `frameContext`'s `cam.roll ?? 0`
and the dropper sweep) and P6 (`orbitControls` reduced to a pure gesture recognizer;
`src/services/engine/subsystems/inputAggregator.ts` run-based fold;
`src/services/engine/frame/drainInput.ts` applied at the top of `runFrame` above the
driver table's `getState()`; `beginDrag` / `cancelCameraTween` fired at DOM time in
the `wireInput` emit sink) landed on `main` as PR #648 (`725c6ddc7`) and are merged
into this branch. Spec §2 records them, including the accepted deviation: the
controller still mutates the OrbitCamera register at the drain, and the returns-pose
shape is deferred to this feature's surface controller (Task 16).

No further prep. Every gesture primitive the spec composes (`quatFromAxisAngle`,
`multiplyQuat`, `rotateVec3ByQuat`, `mat3FromColumns`, `normalize3`, `cross3`,
`smoothstep`, `raySphereRoots`) exists in `src/utils/math/`.

## Strategy

Main has **no** surface-camera machinery (PR #623 closed unmerged), so this is
net-additive. The order below is forced by one property: the union type and its
conversion must exist and be proven lossless before any consumer can be migrated,
and every consumer must be arm-aware before the fold is allowed to produce a body
arm. Concretely:

1. **Phase 1** builds the data delta and every pure primitive with no consumer at
   all. Nothing in the running engine changes; the suite is green throughout for a
   boring reason.
2. **Phase 2** lands the union (`camera.base: FramedCameraPose`) as a
   **behaviour-identical, mechanical** migration — no body arm can be constructed
   yet, so every gate added is trivially true — then provider B, then the fold that
   first makes a body arm reachable.
3. **Phase 3** puts gestures behind the priority-100 driver slot the SpaceMouse
   driver vacated.
4. **Phase 4** migrates the late consumers: the `lonLatFocusPose` instrument, and
   keyframe/tour/serialization frame tagging.
5. **Phase 5** is the perf comparison and the user's feel gate.

Three shapes are pinned here because the spec's §5.1 signature is indicative and the
plan must be exact — see each task:

- The conversions take the orientation-frame bases (`poseBasis`, `upBasis`), without
  which `yaw`/`pitch`/`roll` are undefined and the round trip cannot be lossless.
- `CameraDriver.pose` returns `FramedCameraPose`; `resting` returns `base`
  untouched, the world-only drivers gate their `isActive` on the absolute arm.
- Exactly **one** world-arm resolution per frame (`resolveWorldArm`, called right
  after the fold); every world-shaped reader downstream takes that value. The
  authoritative `cameraRuntime.lastPose` stays framed;
  `helpers/liveWorldPose.ts` is the single off-frame resolution site.

## Global constraints

Binding on every task; do not restate them in commit messages.

- `npm test` and `npm run typecheck` green **at the end of every task**. A task that
  cannot leave the suite green is mis-sized — stop and report.
- **Behaviour outside the engage band is identical to `main`.** Anything a user can
  observe above `SURFACE_REGIME.disengageHR` — framing, drag rates, wheel routing,
  tour playback, boot pose — must not move. Phase 2 in particular is a mechanical
  migration: if a Phase 2 task changes a rendered pixel, it is wrong.
- **No renderer diff.** No slab, layer, shader, tile-planner or `.wesl` file is
  touched (spec §1 non-goals). A renderer file in a task's diff is a review failure.
- `type` aliases, never `interface`. One exported type per file in `src/@types/`, one
  exported function per file in `src/utils/` — filename = symbol name, deep relative
  imports, no barrels. `src/services/**` files may export a small related set (the
  conversion pair is the example).
- Comments per [`conventions/comments.md`](../conventions/comments.md): module header
  ≤ 10 lines, comment lines ≤ half the code lines. Record units, frames, landmines
  and cross-file contracts; link the spec instead of summarising it.
- Tests per [`conventions/testing.md`](../conventions/testing.md). Specifically for
  this plan: **no** runtime tests of the new `.d.ts` shapes, **no** restatement of
  `SURFACE_REGIME` values, and **no mirror tests** — every conversion/gesture
  expectation is a hand-computed value, a round trip, or an independent invariant.
  The one permitted structural greps are the two the spec's acceptance criteria name
  (§11): no stored regime flag, and the amended one-seam importer list.
- All engaged-path arithmetic is SI metres, f64. No field carrying metres may be
  `Mpc`-suffixed, and vice versa.

## Phase 0 — baseline

### Task 1: perf baseline

**Files:** none (measurement only).

Read `.claude/skills/perf/SKILL.md` first. Start this worktree's own dev server and
take the `Local:` port from **its** output — running `npm run perf` without
`--url http://localhost:<port>` silently measures whatever other branch's server is
up, which is the standing trap.

- [ ] `npm run perf -- --url http://localhost:<this worktree's port>`, default poses.
- [ ] Record the full MERGED / PER-LAYER / FLOOR output verbatim in the SDD ledger
      under `Task 1 baseline` (Task 21 diffs against it; a summarised baseline is
      not comparable).
- [ ] No commit.

## Phase 1 — data delta and pure primitives

Nothing in this phase has a consumer. Each task is a new file plus its test.

### Task 2: pose-frame types and the regime constants

**Files (new):** `src/@types/camera/PoseFrame.d.ts`,
`src/@types/camera/BodyFixedPose.d.ts`, `src/@types/camera/FramedCameraPose.d.ts`,
`src/data/camera/surfaceRegime.ts`

Copy the four declarations from spec §3 exactly — field names, units and the
`readonly` markers are the contract the rest of the plan is written against.
`BodyId` comes from `src/@types/data/body/BodyId`; `Vec3` / `Mat3` from
`src/@types/math/`.

`SURFACE_REGIME` (spec §3): `engageHR: 1.7`, `disengageHR: 3.4`,
`tiltMaxRad: Math.PI`, `tiltFullHR: 0.02`. `engageHR` / `disengageHR` / `tiltMaxRad`
are **ruled** (Q6, Q5). `tiltFullHR` is **open until the Task 22 feel gate** — say so
in one line beside it, and nowhere else.

- [ ] Write the four files. No tests: type declarations and a constant table are
      exactly what `testing.md` forbids restating at runtime.
- [ ] `npm run typecheck`.
- [ ] Commit.

### Task 3: the two conversions

**Files (new):** `src/services/engine/camera/poseFrameConversion.ts`,
`tests/services/engine/camera/poseFrameConversion.test.ts`

**Signatures** (this supersedes spec §5.1's indicative form — `yaw`/`pitch`/`roll`
are defined only against the orientation-frame bases, so a conversion without them
cannot round-trip):

```ts
export function toBodyArm(
  pose: CameraPose,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  bodyId: BodyId,
  bodyState: BodyState,
): BodyFixedPose;

export function toWorldArm(
  pose: BodyFixedPose,
  bodyState: BodyState,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  bodyRadiusM: number,
): CameraPose; // carries `roll` — spec §12-R1
```

**Behaviour.** `toBodyArm`: `eyeRel = orientationᵀ · (camPosMpc − bodyPosMpc) ·
MPC_TO_M`, basis through the same rotation, `anchorLocalM = [0,0,0]` (spec §5.3 — the
first landing anchors at the body centre). It captures **nothing** time-dependent: no
epoch, no snapshot (spec §5.1 — this is why a fast clock cannot move the engaged
path). The world eye and camera basis are derived the same way
`frameContext.ts:212-228` derives them (`updatePosition` maths + `imagePlaneBasis`
with `cam.roll ?? 0` and `frameUp(upBasis)`) — read that site, do not re-invent the
basis convention. `toWorldArm` inverts it, then re-derives the orbit
parameterization: `target` on the forward axis at the range to the point under the
screen centre (`raySphereRoots` against the body sphere at `bodyRadiusM`; **a ray
that misses ⇒ target at the body centre**, the pivot-pin-compatible choice, which the
tilt ceiling makes the only reachable case at the disengage boundary), `yaw`/`pitch`
from the eye direction via `orbitAnglesLookingAlong`, `distance = |eye − target|`,
`roll` from the residual screen-up rotation.

This module and `bodyRelativePose.ts` are the only two permitted importers of
`SCALE_UNITS.MPC_TO_M` / `.M_TO_MPC` in the camera path (spec §10; Task 4 enforces).

**Tests** — all fixtures hand-built, none derived with the functions under test:

- `toWorldArm(toBodyArm(pose)) round-trips eye, forward and screen-up over Earth`
- `…round-trips over a body with a tilted pole and a non-identity orientation` —
  the FW-F reviewer's fixture shape; catches the quaternion-order landmine (spec §11).
- `…round-trips a rolled pose` — a pose with non-zero `roll`, the §12-R1 case.
- `…round-trips at a moon's radius` — nothing is Earth-typed.
- Exactness bar: eye, forward and screen-up agree to within provider A's ~14 µm floor.
- `toBodyArm agrees with bodyRelativePose at the same camera` — assert
  `anchorLocalM + eyeRelAnchorM === eyeRelBodyM` and `basisLocal === basisM` from
  `bodyRelativePose` for the same inputs, to that same floor (spec §5.2).

- [ ] Write the tests, watch them fail, implement, `npm test -- poseFrameConversion`.
- [ ] Commit.

### Task 4: amend the one-seam importer test

**Files (modify):** `tests/services/engine/camera/oneMpcSeam.test.ts`

The current sweep covers `src/services/engine/frame` and
`src/services/gpu/renderers/bodies` — the **render** path. Spec §10 amends the gate to
the engaged **camera** path: extend `TS_FILES` with `walk('src/services/engine/camera')`,
`walk('src/services/camera')` and `walk('src/utils/camera')`, and add the existing
legitimate uses to `SCALE_UNITS_ALLOW_LIST` with a category justification each —
`bodyLikeFraming.ts`, `cameraDrivers.ts:332` and `pivotRadiusMpc.ts` are all the
radius→Mpc **framing-bridge** category, not pose math. `bodyRelativePose.ts` and
`poseFrameConversion.ts` are the two **seams**: exclude them from the sweep the way
`bodyRelativePose` is excluded today, and extend the first `it` to assert both.

Do not relax the existing three-file cull/fade allow-list (spec §10).

- [ ] Extend the sweep + allow-list; add `poseFrameConversion.ts` to
      `KNOWN_ANCHOR_FILES`'s spirit (assert the new dirs found real files, or the
      glob can silently sweep zero and pass vacuously).
- [ ] `npm test -- oneMpcSeam` — green, and demonstrably failing if you temporarily
      add a `SCALE_UNITS.M_TO_MPC` use to an un-listed camera-path file.
- [ ] Commit.

### Task 5: the tilt ceiling

**Files (new):** `src/utils/camera/maxTiltRad.ts`,
`tests/utils/camera/maxTiltRad.test.ts`

**Signature:** `maxTiltRad(hOverR: number): number`
**Behaviour:** `SURFACE_REGIME.tiltMaxRad · smoothstep(disengageHR, tiltFullHR, hOverR)`
(spec §6). Note the edge order — `smoothstep(edge0, edge1, x)` with `edge0 >
edge1` is the descending ramp, and it looks like a transposed-argument bug to a
reader who does not know it is deliberate. One comment line.

**Tests:**

- `maxTiltRad(SURFACE_REGIME.disengageHR) === 0` — asserted **against the record**
  (`SURFACE_REGIME.disengageHR`), never a literal `3.4`. This is the Q4 identity and
  a spec §11 acceptance criterion.
- `maxTiltRad is π at and below tiltFullHR`
- `maxTiltRad crosses 90° near 1.71 R` — the midpoint of the two edges (spec §6);
  assert the crossing lies between 1.6 and 1.8, not an exact value, so a feel-gate
  tweak to `tiltFullHR` does not make this a tollbooth.
- `maxTiltRad is monotonically non-increasing in h/R` over a sampled sweep.

- [ ] TDD, `npm test -- maxTiltRad`, commit.

### Task 6: re-anchoring

**Files (new):** `src/utils/camera/reanchoredPose.ts`,
`tests/utils/camera/reanchoredPose.test.ts`

**Signature:** `reanchoredPose(pose: BodyFixedPose): BodyFixedPose`
**Behaviour** (spec §5.3): move the anchor toward the eye and subtract the same
delta, so the pair still names the same body-fixed point while both stored magnitudes
shrink. The shift is **quantized to the ulp of the anchor's own magnitude** before it
is applied — that is what makes both updates exact. Trigger: range below a
magnitude-relative fraction of `|anchorLocalM|`, so the rule is body-independent and
needs no per-body constant. Below the trigger, return the input **by reference**.

Not reached at the shipped descent floor with a centre anchor (spec §5.3) — it is
built and tested now because the deep-zoom anchor is wanted and this is not being
redone later. Say that in one header line; do not explain the floor here.

**Tests:**

- `reanchoredPose leaves the named point unmoved` — `anchor + eyeRel` is
  **bit-identical** before and after, not close-to.
- `reanchoredPose shrinks |eyeRelAnchorM|` for a pose past the trigger.
- `reanchoredPose returns the input unchanged below the trigger` (reference equality).

- [ ] TDD, commit.

### Task 7: the cursor ray

**Files (new):** `src/utils/camera/cursorRayBodyLocal.ts`,
`tests/utils/camera/cursorRayBodyLocal.test.ts`

**Signature** (spec §6):

```ts
export function cursorRayBodyLocal(
  pose: BodyFixedPose,
  pixel: Vec2,
  viewportPx: Vec2,
  fovYRad: number,
): { readonly originM: Vec3; readonly dir: Vec3 };
```

Built from `basisLocal` and the FOV directly — **no matrix inverse**, so it cannot
drift from the slab's vp. `pixel` and `viewportPx` are CSS pixels. `originM` is the
eye in body-fixed metres (`anchorLocalM + eyeRelAnchorM`); `dir` is unit.

**Tests** (hand-computed):

- `the screen-centre pixel rays along the pose forward axis`
- `a pixel at the top edge rays at fovY/2 above forward`
- `a horizontal edge pixel rays at the aspect-scaled half-angle` — catches the
  aspect term being applied to the wrong axis, the classic form of this bug.
- `dir is unit for an off-axis corner pixel`

- [ ] TDD, commit.

### Task 8: the surface readout

**Files (new):** `src/@types/camera/SurfaceReadout.d.ts`,
`src/utils/camera/surfaceReadoutOf.ts`, `tests/utils/camera/surfaceReadoutOf.test.ts`

Type verbatim from spec §3 — including that `tiltRad` is measured from local
**NADIR** (0 = straight down, π = zenith), never Cesium's complementary pitch. The
datum is in the field name deliberately; keep it.

**Signature:** `surfaceReadoutOf(pose: BodyFixedPose, bodyRadiusM: number): SurfaceReadout`
**Behaviour:** KML `LookAt` semantics evaluated in the ENU of the point under the
screen centre. `altitudeM` is `|eye| − R` — **eye-based, never pivot- or
target-derived** (FW-A, spec §11).

**Tests:**

- `altitudeM is |eye| − R, not derived from the range` (**FW-A**) — construct a pose
  whose sightline range differs sharply from its altitude and assert the altitude.
- `standpoint is the sub-camera lon/lat at nadir` — hand-computed against
  `directionToLonLatDeg`'s convention.
- `heading falls back to the up vector within ~0.08° of vertical` — the nadir escape
  (spec §14).
- `readout is finite and continuous stepping across the pole` — the pole escape.
- `tiltRad is 0 looking straight down and π looking at the zenith` — pins the datum.

- [ ] TDD, commit.

### Task 9: the descent floor in metres

**Files (new):** `src/utils/camera/surfaceFloorM.ts`,
`tests/utils/camera/surfaceFloorM.test.ts`

**Signature:** `surfaceFloorM(bodyRadiusM: number): number`
**Behaviour:** `bodyRadiusM * SURFACE_STANDOFF_RADII`, importing that constant from
its **single existing declaration** (`src/utils/camera/clampDistance.ts:47`) — spec
§10's requirement is that the two arms cannot disagree about where the ground is, so
re-declaring the ratio in metres is the specific thing forbidden here.

The floor is unconditional and is resampled **after the last position write** of a
gesture (spec §6, landmine O §4) — the gesture tasks own that ordering; this task
owns only the value.

**Test:** `surfaceFloorM tracks the shared standoff ratio` — assert
`surfaceFloorM(R) / R === SURFACE_STANDOFF_RADII` for two different radii. (Not a
constant restatement: the fact under test is that the two arms read one declaration.)

- [ ] TDD, commit.

### Task 10: anchored drag rotation

**Files (new):** `src/utils/camera/anchoredDragRotation.ts`,
`tests/utils/camera/anchoredDragRotation.test.ts`

**Signature:**

```ts
export function anchoredDragRotation(
  pose: BodyFixedPose,
  prevRay: { readonly originM: Vec3; readonly dir: Vec3 },
  currRay: { readonly originM: Vec3; readonly dir: Vec3 },
  anchorRadiusM: number,
): BodyFixedPose | null; // null ⇒ a ray missed the frozen sphere; caller degrades to trackball
```

**Behaviour** (spec §6a): intersect both rays with the **frozen** pick sphere of
radius `anchorRadiusM` (`raySphereRoots`), then rotate the pose — **position and
basis together** — by the quaternion carrying `p̂₀` to `p̂₁`
(`quatFromAxisAngle` + `rotateVec3ByQuat`; rebuild the basis columns and
`reorthonormalise`). Pole-free and identical at every latitude: there is no
`cos(latitude)` term to be wrong, and dragging over the pole is an ordinary rotation
with a near-equatorial axis. At grazing incidence (`|ray·normal| < 0.05`) a rotation
is a teleport, so return `null` and let the caller strafe in the plane through the
anchor (spec §6a, C §2.8) — a **hard test**, never a blend, which would be a second
path hiding drift. The grazing threshold is feel-open until Task 22.

**Tests** (**FW-I** — the drag-exactness criterion):

- `a two-ray drag at the equator puts the grabbed point back under the cursor` —
  re-project the rotated anchor point through `cursorRayBodyLocal` and assert it
  lands on the current pixel to sub-pixel tolerance.
- `…at 80° latitude` and `…dragging across the pole` — same assertion, hand-built
  fixtures; these are the cells probe defect 1 failed.
- `the rotation carries the basis, not only the position` — assert screen-up after
  the drag is the parallel transport, not the original vector.
- `a grazing ray returns null` (|ray·normal| under the threshold).
- `a ray that misses the frozen sphere returns null`.

- [ ] TDD, commit.

### Task 11: anchored zoom step

**Files (new):** `src/utils/camera/anchoredZoomStep.ts`,
`tests/utils/camera/anchoredZoomStep.test.ts`

**Signature:**

```ts
export function anchoredZoomStep(
  pose: BodyFixedPose,
  factor: number,
  cursorAnchorM: Vec3 | null, // null ⇒ centre-directed
  bodyRadiusM: number,
): BodyFixedPose;
```

**Behaviour** (spec §6b): `eye′ = anchor + factor · (eye − anchor)` — **stateless per
tick, no accumulator** (FW-B). The distance _measure_ comes from the screen centre;
the _anchor_ comes from the cursor. Approaching with a cursor hit anchors on the
cursor; **zoom-out, and any cursor miss, is always centre-directed** (FW-H — the
cursor anchor is a repelling fixed point on the way out, and the offset it
accumulates is `altitude · tan(off-axis)` at every scale, i.e. geometry, not a
storage artefact). Guards: clamp the step **magnitude on both signs**; force a fresh
anchor pick after an overshoot past the anchor's tangent plane (report that to the
caller via the returned pose being past the plane — the controller re-picks); gate
the approach on **closing distance**, never absolute altitude. Floor the result with
`surfaceFloorM(bodyRadiusM)`.

**Tests:**

- `260 notches out and back with the cursor parked returns to the starting pose`
  (**FW-H**, spec §11) — bit-comparable to a tight tolerance, no drift.
- `zoom is stateless: the same input pose and factor give the same output twice`
  (**FW-B**) — and no module-level mutable state exists to make it otherwise.
- `zooming out ignores the cursor anchor` — the same out-step with and without a
  cursor anchor produces the same pose.
- `an approach step never goes below the surface floor`.
- `an oversized factor is clamped on both signs` (**FW-D**'s bounded-step half).

- [ ] TDD, commit.

### Task 12: the regime predicate

**Files (new):** `src/services/engine/camera/regimeArmFor.ts`,
`tests/services/engine/camera/regimeArmFor.test.ts`,
`tests/services/engine/camera/noStoredRegimeFlag.test.ts`

**Signature:**

```ts
export function regimeArmFor(
  current: PoseFrame,
  eyeMpc: Readonly<Vec3>,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
): PoseFrame;
```

**Behaviour** (spec §4, §12-R2): the discriminant is `h/R` with `h = |eye − body| − R`
— **eye-based**, never pivot-derived (FW-A). Radii come from `SCENE_BODIES`
(`radiusM`); the roster is the intersection of that registry with the `bodyStates`
map the frame derived, so the predicate is body-blind (`argmin h/R`) and reads
**geometry only** — never focus, never the drag mode, never a render path. Hysteresis
falls out of `current`: from `'absolute'` the test is `min(h/R) < engageHR`; from a
body arm it is `h/R > disengageHR` **for that body**. There is no boolean anywhere —
`camera.base.frame` _is_ the regime.

The gesture-in-flight rule (spec §4: no flip during an active gesture) belongs to the
**caller** (Task 15), not here: this function stays a pure geometric read.

**Tests:**

- `engages the nearest body below 1.7 R` and `holds the world arm above it`.
- `holds an engaged body arm until 3.4 R` — the hysteresis, from both directions.
- `picks the minimising body when two are close` — an unfocused flyby engages
  (spec §12-R2); assert focus is not an input by passing none at all.
- `is body-blind: a small moon engages at its own 1.7 R` — no Earth-typed constant.
- **`noStoredRegimeFlag.test.ts`** — the spec §11 grep criterion, written as an
  import-graph / declaration scan in the shape of `oneMpcSeam.test.ts` (ts-morph, not
  a substring search): no module under `src/state/`, `src/services/engine/camera/`,
  `src/services/camera/` or `src/@types/camera/` declares a boolean field or variable
  whose name matches `/surface|regime|engaged/i`. Name the rule in the header: the
  arm tag is the only discriminant, and an inconsistent pair must stay
  unrepresentable.

- [ ] TDD, commit.

## Phase 2 — the union, provider B, and the fold

### Task 13: `camera.base` becomes `FramedCameraPose`

**Files (modify):** `src/@types/camera/CameraState.d.ts`,
`src/@types/engine/state/CameraRuntime.d.ts`,
`src/@types/engine/camera/CameraDriver.d.ts`, `src/state/camera/cameraSlice.ts`,
`src/state/camera/selectors.ts`, `src/state/camera/watchOrientationChangeSaga.ts`,
`src/state/camera/watchFlyToLonLatSaga.ts`, `src/state/camera/orientationActions.ts`,
`src/state/perf/installPerfHook.ts`, `src/services/engine/camera/cameraDrivers.ts`,
`src/services/engine/camera/applyWheelZoom.ts`,
`src/services/engine/camera/applyFocusedBodyPivot.ts`,
`src/services/engine/frame/runFrame.ts`, `src/services/engine/frame/drainInput.ts`,
`src/services/engine/phases/wireInput.ts`, `src/services/engine/engine.ts`,
`src/services/engine/wiring/buildDemandCtx.ts`,
`src/services/engine/helpers/liveRenderCamera.ts`,
`src/services/engine/animation/playClip.ts`, `src/services/engine/subsystems/clipPlayer.ts`,
plus the `tests/` mirrors of each.
**Files (new):** `src/utils/camera/absoluteArm.ts`,
`src/services/engine/helpers/liveWorldPose.ts`,
`src/utils/camera/eyeMpcOf.ts`

The spec's honest cost (§12-T2): every reader of `camera.base` becomes frame-aware.
It is bounded and enumerable, and this task is where it is paid — **mechanically**.
No body arm can be constructed until Task 15, so every gate added here is trivially
true and no behaviour moves.

**Contract:**

```ts
// src/@types/camera/CameraState.d.ts
base: FramedCameraPose; // was CameraPose

// src/@types/engine/state/CameraRuntime.d.ts
lastPose: {
  current: FramedCameraPose;
} // the AUTHORITATIVE produced pose

// src/@types/engine/camera/CameraDriver.d.ts
pose: (s: RootState, cam: OrbitCamera, elapsedMs: number) => FramedCameraPose;

// src/utils/camera/absoluteArm.ts — the mechanical wrapper at world-arm producers
export function absoluteArm(pose: CameraPose): FramedCameraPose;

// src/services/engine/camera/poseFrameConversion.ts — added export
export function resolveWorldArm(
  framed: FramedCameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): CameraPose;

// src/services/engine/helpers/liveWorldPose.ts — the ONE off-frame resolution site
export function liveWorldPose(state: EngineState): CameraPose;

// src/utils/camera/eyeMpcOf.ts — the eye the regime predicate reads
export function eyeMpcOf(pose: CameraPose, poseBasis: Readonly<Mat3>, out?: Vec3): Vec3;
```

**Rules for the migration:**

- `commitCameraPose` takes a `FramedCameraPose`. World-arm dispatch sites wrap with
  `absoluteArm(...)` — that is the whole diff at most of them.
- `selectCameraBase` returns the `FramedCameraPose` (spec §9). Readers that are
  world-arm concerns by nature read through `resolveWorldArm` / `liveWorldPose`.
- Driver rows: `resting` returns `s.camera.base` **unchanged** (arm-agnostic, still
  the floor and still always active). `orbitDrag`, `autoRotate` and `followBody` are
  world-arm producers — wrap with `absoluteArm` **and** add
  `s.camera.base.frame === 'absolute'` to their `isActive` (spec §7: the follow
  driver's approach ease and idle hold have no meaning once the state co-rotates).
  `tween` / `clip` keep producing absolute for now; Task 20 gives them frame tags.
- `applyWheelZoom` and `applyFocusedBodyPivot` are world-arm-only (spec §7). Give
  each an explicit early return on a body arm rather than letting a caller remember
  — the pin has nothing to do in a co-rotating frame, and the wheel's three distance
  owners are simply not consulted.
- `eyeMpcOf` is extracted from `updatePosition`'s maths and `updatePosition`
  **delegates to it**, so the eye has one derivation. Keep `updatePosition`'s
  allocation-free contract: it passes its module scratch as `out`.
- `liveWorldPose` resolves `cameraRuntime.lastPose.current` against
  `deriveBodyStates(cameraRuntime.lastRenderedSimDays.current)` — the pick path's
  epoch rule (see `CameraRuntime.d.ts`'s `lastRenderedSimDays` note) is why it reads
  that field and not a fresh clock sample. `liveRenderCamera`, `buildDemandCtx`,
  `engine.ts`'s `getLivePose`, `drainInput`'s gesture seed and `cameraDrivers`'
  `followFrom` capture all route through it — no second resolution site.

**Tests:** the existing suite is the gate. Add exactly two:

- `resolveWorldArm returns the absolute arm's pose by reference` — the idempotence
  that makes the fold free on world-arm frames.
- `liveWorldPose resolves a body arm at the last RENDERED sim epoch` — a body-arm
  `lastPose` plus a clock that has moved on; the resolved pose must use the rendered
  epoch, not the current one.

Update existing tests only where the type forces it (wrap fixtures in
`absoluteArm`). A test whose **assertion** changes in this task is a signal the
migration moved behaviour — stop and report.

- [ ] Migrate, `npm test` (full suite), `npm run typecheck`.
- [ ] Commit.

### Task 14: provider B behind the pose seam

**Files (new):** `src/utils/camera/poseFromBodyArm.ts`,
`tests/utils/camera/poseFromBodyArm.test.ts`
**Files (modify):** `src/services/engine/frame/frameContext.ts`,
`tests/services/engine/frame/frameContext.test.ts`

**Signature:** `poseFromBodyArm(pose: BodyFixedPose): BodyRelativePose` —
`eyeRelBodyM = anchorLocalM + eyeRelAnchorM`, `basisM = basisLocal`. The anchor fold
is the whole conversion; the ~nm floor is the point of it.

At the existing seam (`frameContext.ts:212-233`, the `bodyPose` closure) branch per
spec §5.2: the engaged body gets provider B, **every other body keeps provider A**
(ruled, S1), and on approach from deep space the camera is heliocentric regardless.
`deriveFrameContext` needs the arm — thread the `FramedCameraPose` in beside the
already-resolved world pose rather than re-resolving it.

Unreachable until Task 15 flips the fold on; that is deliberate — it lands tested and
inert so the fold's task is a one-concern change.

**Tests:**

- `provider B and provider A agree at the engage boundary` — same camera, both
  providers, agreement to provider A's ~14 µm floor (spec §5.2's stated unit test).
- `provider A still serves every body that is not the engaged one` — a two-body
  frame with one arm engaged.
- `poseFromBodyArm folds the anchor exactly` — a non-zero anchor, hand-computed.

- [ ] TDD, commit.

### Task 15: the fold

**Files (modify):** `src/services/engine/frame/runFrame.ts`,
`tests/services/engine/frame/runFrame.test.ts`, plus a new
`tests/services/engine/frame/poseFold.test.ts`

Steps 5–6 of spec §7, **last**: below driver arbitration, after every pose writer for
the frame, at exactly one site. FW-G's round-1 finding was that a commit-on-edge
above the fold discards it and the wrong writer wins — so the fold goes **after**
step 3b (pivot pin) and **before** step 4 (`lastPose.current = …`) and the frame
context derivation. Read `runFrame.ts:359-490` before editing; the ordering comments
there are the contract you are extending.

Shape (prose, not a snippet to paste): resolve this frame's world pose once via
`resolveWorldArm`; derive the eye with `eyeMpcOf`; **skip the predicate entirely
while a gesture is in flight** (`rootState.camera.dragging`) and re-evaluate at
gesture end (spec §4 — this subsumes FW-C's mid-drag wheel guard and FW-D's
gesture-scoped latch); otherwise call `regimeArmFor` and normalize `renderPose` to
the resulting arm with the Task 3 conversion pair, which is a no-op by reference when
the arms already agree. Then the existing step 4 and the scale-bar snap and
`deriveFrameContext` all consume the **resolved world pose** computed here — one
resolution per frame, no second call.

**Tests:**

- `the fold runs after the pivot pin and before lastPose is updated` (**FW-G**) —
  assert the call order via spies, the way the existing commit-on-edge tests do.
- `a gesture in flight cannot change the arm` (spec §11) — dragging across the
  engage threshold leaves `frame` untouched; releasing re-evaluates.
- `crossing the engage threshold does not move the rendered camera` — eye, forward
  and screen-up on the frame before and the frame after agree to the ~14 µm floor.
  This is the **no-snap** acceptance criterion.
- `the pivot pin and the follow driver are inert in a body arm` (spec §14).
- `the wheel does not route through applyWheelZoom in a body arm`.

- [ ] TDD, full suite, commit.

## Phase 3 — gestures

### Task 16: the surface controller

**Files (new):** `src/@types/camera/SurfaceGesture.d.ts`,
`src/services/camera/surfaceController.ts`,
`tests/services/camera/surfaceController.test.ts`
**Files (modify):** `src/services/engine/frame/drainInput.ts`,
`src/services/engine/camera/cameraDrivers.ts`

`SurfaceGesture` verbatim from spec §3 — per-gesture, latched at gesture start, dead
at pointerup (ruled, Q3). `anchorRadiusM` is the **frozen** pan sphere (`|first
pick|`); `anchorLocalM` is body-fixed, **never world** (C landmine #5); `prevPixel` is
the previous **frame's** end pixel, not the press point (C §2.1 — the aggregator's
`InputStep.drag` already carries `startPx`/`endPx` in exactly that encoding; read
`src/@types/camera/InputStep.d.ts`).

**Controller contract:**

```ts
export function createSurfaceController(): {
  readonly apply: (
    arm: BodyFixedPose,
    step: InputStep,
    viewportPx: Vec2,
    fovYRad: number,
    bodyRadiusM: number,
  ) => BodyFixedPose;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
};
```

Mode selection (spec §6, C §5.1): **what the cursor is over** decides; altitude is
only a tiebreak. Cursor hits the body → anchored pan at any altitude (Task 10);
cursor misses and high → trackball; cursor misses and low → free-look. The mode is
latched at gesture start and **sticky** for the gesture. A pan whose ray misses the
frozen sphere degrades to trackball, stickily; grazing incidence strafes in the plane
through the anchor. Zoom routes to Task 11. Tilt orbits the pose about the latched
ground anchor — heading about the anchor's local up, **then** tilt about the
_already-yawed_ east (the intrinsic Z-X-Z order KML specifies; the probe measured a
fixed-screen-axis tilt dragging ~10° of unwanted heading per 60 px). Look rotates the
basis about the eye, which never moves — the only route to the sky.

There is **no persistent target**: the anchor dies at pointerup, which is what makes
FW-H's proven root cause (an accumulating stored pivot) unreachable rather than
handled.

Wiring: the controller occupies the **priority-100** driver slot the SpaceMouse
driver vacated (spec §7), active only while a gesture is in flight **and** the arm is
a body arm. `drainInput` routes its steps to the controller instead of
`applyInputToCamera` / `applyWheelZoom` when the arm is a body arm; the world-arm
path is untouched.

**Tests:**

- `the mode is latched at gesture start and sticky` — a mid-gesture cursor move off
  the body does not change the mode.
- `a trackpad inertial burst after pointerup neither starts a gesture nor moves the
view` (**FW-C**).
- `the gesture's rate currency does not alternate frame to frame across the limb`
  (**FW-D**) — walk a drag across the limb and assert the per-step magnitude stays
  bounded and single-signed.
- `tilt applies heading then tilt about the already-yawed east` — assert against a
  hand-computed pose that a fixed-axis order would get wrong.
- `look leaves the eye and altitude bit-identical while heading stays live`.
- `an overshoot past the anchor tangent plane forces a fresh anchor pick`.

- [ ] TDD, commit.

### Task 17: ceiling enforcement on driven writes

**Files (modify):** `src/services/camera/surfaceController.ts`,
`tests/services/camera/surfaceController.test.ts`

Enforcement is **orientation-only, applied after every write to the body arm**
(spec §6, §12-R3): recompute the ENU at the new standpoint and rebuild the basis from
`(heading, min(tilt, maxTiltRad(h/R)))`. **The eye never moves.**

Not an entry clamp (spec §12-R3): enforcing on arm entry would snap a pose that
arrives above the ceiling — a flyby aimed away from the body, a tour keyframe. Since
altitude only changes through zoom, and zoom re-levels through the ceiling, every
path the user can drive still lands at `tilt = 0` by the disengage boundary. Put that
sentence's _content_ in the header in one line; it is the reason the ceiling's zero
must sit exactly at `disengageHR`.

**Tests:**

- `a zoom-out re-levels against the new local vertical` — the camera converges to
  top-down with **no untilt tween anywhere**.
- `the pose reaching the disengage boundary has tilt 0` — so its forward axis points
  at the body centre and it survives the world regime's pivot pin unchanged. This is
  what the Q4 invariant buys.
- `enforcement never moves the eye` — bit-identical eye before and after.
- `a pose entering the arm above the ceiling is not clamped` (spec §12-R3).

- [ ] TDD, commit.

### Task 18: clock and frame-loop integration

**Files (new):** `tests/services/engine/frame/engagedArmClock.test.ts`

The spec §14 "Clock" verification, stated as an **equality, not a tolerance**: with
the sim clock at high rate and the arm engaged, a tracked ground point's body-fixed
coordinates are **bit-identical across frames** — the `ω × r` residual is exactly
zero, because nothing in the engaged path reads a world position.

**Tests:**

- `the tracked ground point is bit-identical across frames under a 10⁶× clock`
  (**FW-F**).
- `the engaged pose is unchanged by advancing the clock alone` — no gesture, no
  driver, just time.
- `crossing out of the arm under an accelerated clock does not snap the image` —
  the H1 boundary; the perceptual measurement itself is Task 22's user gate.

- [ ] TDD, commit.

## Phase 4 — late consumers

### Task 19: `lonLatFocusPose` becomes a body-arm constructor

**Files (modify):** `src/utils/camera/lonLatFocusPose.ts`,
`src/state/camera/watchFlyToLonLatSaga.ts`, plus their tests.

The deferred item from spec 1's ledger ("STOPPED per standing ruling — reaches
`CameraPose`/`OrbitCamera` = spec-2 territory"). Today it builds a local direction,
rotates it out to world, and recovers `(yaw, pitch)` through
`orbitAnglesLookingAlong` — a body-relative intent expressed as an Mpc round trip.

**New signature:**

```ts
export function lonLatFocusPose(
  point: LonLatDeg,
  bodyId: BodyId,
  bodyRadiusM: number,
  rangeM: number,
  headingRad: number,
): BodyFixedPose;
```

No Mpc in it: standpoint from the lon/lat, range preserved, tilt 0, heading
preserved. If the resulting pose is outside the band, the Task 15 fold converts it —
**the instrument does not need to know**. That is the general rule (spec §9): a
producer that is body-relative by nature authors a body arm; the fold is the single
site that reconciles.

The saga's `distance` currently comes from the resting pose in Mpc; it becomes a
range in metres via the resolved arm. Keep the instant-commit (a snap, not a fly).

**Tests:**

- `lonLatFocusPose puts the given lon/lat under the camera` — round-trip through
  `surfaceReadoutOf`, asserting `standpoint` back.
- `…at the requested range and at tilt 0`.
- `the fly-to saga commits a body arm` and `…the fold converts it when out of band`.

- [ ] TDD, commit.

### Task 20: frames for keyframes, tours, and serialization

**Files (modify):** `src/@types/animation/CameraAction.d.ts`,
`src/services/engine/camera/evaluateClip.ts`,
`src/services/engine/camera/cameraDrivers.ts` (tween/clip rows),
`src/services/engine/helpers/logCameraState.ts`, plus tests.

**Convert now** (ruled, Q10-B): keyframes today interpolate in absolute Mpc, which is
wrong the moment the sim clock moves.

**Contract:** the animation system keeps its four channels and its `Space` mapping —
this is the tag-beside-channels form T4 ruled for, **not** the declined `FramedPose`
rewrite. Each base-layer endpoint (`set` / `setVec`) grows
`readonly frame?: PoseFrame`, absent ⇒ `'absolute'`. Relative writers (`spin`,
`rate`, `osc`) act in whatever arm is current and are **untouched**.

**Interpolation runs in the endpoint's own frame.** A leg whose endpoints disagree
converts its start into the endpoint's frame **once, at leg start**, through the Task
3 pair. Body-framed channel values are read in that body's fixed axes, in metres:
`target` is a body-fixed point, `distance` is a range, `yaw`/`pitch` are angles about
the body's own axes — a LookAt, decoded to a `BodyFixedPose` at the driver's exit.
Authored keyframes are **decoded, never accumulated**, so the pole degeneracy that
rules angles out as state does not reach them.

Deep-space keyframes stay absolute Mpc and **no existing clip changes**: the grand
tour's near-body beats already reference ids resolved at play time (`moveTargetId` /
`dollyToId`), which are frame-free by construction. Assert that.

**Serialization** (ruled, Q10b): the serialized form names its frame; untagged legacy
input parses as `'absolute'`. The URL hash carries no camera pose today
(`HASH_PARAM_SOURCES` is `focus`, `t`, `orientation`), so there is nothing to migrate
— the deliverable is the rule plus its one live consumer: `logCameraState`'s debug
blob names the frame and prints **metres** in a body arm.

**Tests:**

- `an untagged endpoint parses as absolute` — the legacy path.
- `a leg with disagreeing endpoints converts its start once, at leg start` — assert
  the conversion is called exactly once for a multi-frame leg.
- `a body-framed leg interpolates in body-fixed metres` — hand-computed midpoint.
- `no existing clip's evaluated pose changes` — run a registry clip before/after.
- `logCameraState names the frame and prints metres in a body arm`.

- [ ] TDD, full suite, commit.

## Phase 5 — measurement and the gate

### Task 21: perf after, and the landing verdict

**Files:** none.

Re-run the Task 1 measurement, same flags, same poses, **same worktree URL trap**.
The work is CPU-side and small; **neutral is the expectation and the bar**.

- [ ] `npm run perf -- --url http://localhost:<this worktree's port>`.
- [ ] Diff against the Task 1 baseline verbatim in the ledger. Interpret per the
      `perf` skill (MERGED vs PER-LAYER vs FLOOR; Apple Silicon slot-sum inflation).
- [ ] **A neutral-or-negative measurement halts the landing pipeline.** Land or park
      is the user's ruling, never process momentum (spec §11).

### Task 22: USER GATE — visual and feel pass

**Owner: the user. Not an agent task.** Dev server, real data, **f.lux off before any
colour judgement**. Spec §11's list, verbatim:

1. Descend from 5 R to the descent floor over Earth: **no snap at either crossing**,
   no ground drift once engaged, the camera settles top-down on the way back out with
   no tween.
2. Drag at 1:1 across the equator, over a pole, and at a grazing limb — the grabbed
   point stays under the cursor; no twist, no teleport.
3. Tilt to the horizon and look to the zenith from ~2 m altitude; heading stays live
   while pinned; the horizon is level at every latitude and azimuth (probe defect 3's
   failing cells: due east from the frame equator, and Denmark's latitude).
4. Zoom-out-then-in round trip with the cursor parked off-centre.
5. Accelerated clock at high rate, sitting engaged: the ground is nailed and the sun
   and stars sweep; then cross the boundary and watch the drift onset. **This is the
   H1 measurement — adverse evidence, and only adverse evidence, buys H2**
   (smoothstepping the co-rotation rate over ~1 s).
6. The same sequence over the Moon and over Mars: nothing in the path is Earth-typed.

Feel constants are settled **here**, not before: `SURFACE_REGIME.tiltFullHR`, the
grazing-incidence threshold (Task 10), and the zoom step-magnitude clamp (Task 11).
No published reference exists for any of them. Also flagged for this gate: **small
bodies** — on a ~10 km moon the band engages at ~17 km altitude, which is correct but
may feel abrupt. If the gate objects, the remedy is a per-row engage floor — a
registry parameter, **never a second regime**.

- [ ] Record the verdict per item in the ledger. Any adverse finding is a fix loop
      before `/feature-done`, not a follow-up.

## File structure

**Created**

```
src/@types/camera/PoseFrame.d.ts                    T2
src/@types/camera/BodyFixedPose.d.ts                T2
src/@types/camera/FramedCameraPose.d.ts             T2
src/@types/camera/SurfaceReadout.d.ts               T8
src/@types/camera/SurfaceGesture.d.ts               T16
src/data/camera/surfaceRegime.ts                    T2
src/services/engine/camera/poseFrameConversion.ts   T3  (+ resolveWorldArm, T13)
src/services/engine/camera/regimeArmFor.ts          T12
src/services/engine/helpers/liveWorldPose.ts        T13
src/services/camera/surfaceController.ts            T16
src/utils/camera/maxTiltRad.ts                      T5
src/utils/camera/reanchoredPose.ts                  T6
src/utils/camera/cursorRayBodyLocal.ts              T7
src/utils/camera/surfaceReadoutOf.ts                T8
src/utils/camera/surfaceFloorM.ts                   T9
src/utils/camera/anchoredDragRotation.ts            T10
src/utils/camera/anchoredZoomStep.ts                T11
src/utils/camera/absoluteArm.ts                     T13
src/utils/camera/eyeMpcOf.ts                        T13
src/utils/camera/poseFromBodyArm.ts                 T14
tests/** mirroring each of the above
tests/services/engine/camera/noStoredRegimeFlag.test.ts   T12
tests/services/engine/frame/poseFold.test.ts              T15
tests/services/engine/frame/engagedArmClock.test.ts       T18
```

**Modified**

```
src/@types/camera/CameraState.d.ts                  T13  base: FramedCameraPose
src/@types/engine/state/CameraRuntime.d.ts          T13  lastPose: framed
src/@types/engine/camera/CameraDriver.d.ts          T13  pose returns framed
src/@types/animation/CameraAction.d.ts              T20  frame tag on set/setVec
src/state/camera/{cameraSlice,selectors}.ts         T13
src/state/camera/{watchOrientationChangeSaga,orientationActions}.ts   T13
src/state/camera/watchFlyToLonLatSaga.ts            T13, T19
src/state/perf/installPerfHook.ts                   T13
src/services/engine/camera/cameraDrivers.ts         T13, T16, T20
src/services/engine/camera/applyWheelZoom.ts        T13  world arm only
src/services/engine/camera/applyFocusedBodyPivot.ts T13  world arm only
src/services/engine/camera/evaluateClip.ts          T20  per-leg frame conversion
src/services/engine/frame/runFrame.ts               T13, T15  the fold
src/services/engine/frame/frameContext.ts           T14  provider B branch
src/services/engine/frame/drainInput.ts             T13, T16
src/services/engine/phases/wireInput.ts             T13
src/services/engine/engine.ts                       T13
src/services/engine/wiring/buildDemandCtx.ts        T13
src/services/engine/helpers/liveRenderCamera.ts     T13
src/services/engine/helpers/logCameraState.ts       T20  names the frame
src/services/engine/animation/playClip.ts           T13
src/services/engine/subsystems/clipPlayer.ts        T13
src/utils/camera/updatePosition.ts                  T13  delegates to eyeMpcOf
src/utils/camera/lonLatFocusPose.ts                 T19  body-arm constructor
tests/services/engine/camera/oneMpcSeam.test.ts     T4   importer amendment
```

**Untouched** — every slab, layer, shader and renderer file; the tile pipeline; the
`.bin` catalog path; `HASH_PARAM_SOURCES`; `followPanOffset` / `followBody`'s
deep-space behaviour.

## Definition of Done

**Deliverable inventory**

- [ ] `FramedCameraPose` is the store's camera currency; `camera.base.frame` is the
      only regime discriminant in the tree.
- [ ] `poseFrameConversion` exports `toBodyArm` / `toWorldArm` / `resolveWorldArm`,
      and is the second and last permitted importer of `MPC_TO_M` / `M_TO_MPC` in the
      camera path.
- [ ] Provider B is selected at the existing `frameContext` seam; provider A still
      serves every other body.
- [ ] The surface controller holds the priority-100 driver slot and is active only
      while a gesture is in flight in a body arm.
- [ ] `lonLatFocusPose` authors a body arm with no Mpc in it.
- [ ] `set` / `setVec` endpoints carry an optional `PoseFrame`; `logCameraState`
      names the frame and prints metres in a body arm.

**Acceptance criteria from spec §11**

- [ ] **Pose exactness at engage and disengage** — eye, forward and screen-up
      round-trip to within provider A's ~14 µm floor, over a body with a **tilted
      pole** and a non-identity orientation.
- [ ] **No-snap crossing** — the rendered camera on the frame before and the frame
      after a threshold crossing agrees to that same floor, in both directions.
- [ ] **Grep: no stored regime flag** — `noStoredRegimeFlag.test.ts` green, and the
      one-seam importer test green with the camera path swept.
- [ ] `maxTiltRad(SURFACE_REGIME.disengageHR) === 0`, asserted against the record.
- [ ] A gesture in flight cannot change the arm.
- [ ] The nine fix waves carried forward as named tests: FW-A (T8), FW-B + FW-H
      (T11), FW-C + FW-D (T16), FW-E (subsumed — 3.4 R makes it trivially true,
      ruled Q6), FW-F (T18), FW-G (T15), FW-I (T10).

**Named observable behaviours (the Task 22 manual pass)** — the six items in Task 22,
each recorded pass/fail with the user's own words, not "works correctly".

**Perf** — before/after recorded verbatim; neutral or better, or an explicit
land/park ruling from the user.

**Deferral boundary — do not chase these**

- Inertia / coast: none in this landing. If ever added, flick-only synthetic replay
  **in the body-fixed frame** (written down, zero LOC).
- MapLibre's pole "dial" band: no.
- Terrain-height collision, DEM-driven sensitivity, streaming-height low-pass:
  skymap's bodies are analytic spheroids and the tile pipeline streams imagery, not
  elevation. The rules are recorded in the code's comments so a future DEM cannot
  arrive frame-blind; nothing is built.
- XR and 6-DoF devices.
- Any renderer change at all.
- **Lowering the descent floor** — re-anchoring is built and tested so the floor is a
  constant rather than an architectural limit; moving it is a separate, measurable
  change.
- H2 (smoothstepped co-rotation onset) — bounded escalation path, spent only on
  adverse Task 22 evidence.
- A tour ending on a non-body-centred pose while a body is focused snaps when the
  resting driver's pivot pin resumes. Incumbent property of the pin, not spec 2's.
