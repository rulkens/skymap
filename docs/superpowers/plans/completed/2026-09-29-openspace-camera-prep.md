# OpenSpace camera mode — PR 1 ground preparation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Create the five joints the OpenSpace control scheme needs (P1–P5), all behaviour-neutral: the skymap scheme renders, drives and commits exactly as before.

**Architecture:**
- The driver table's `isActive` gets an activity bag.
- The driver table moves behind a one-row control-scheme registry.
- `CameraPose` gains an optional `lookOffset` that turns only the view.
- The body arm's orbit/look solves and the post-drag settle come out of the pixel path.
- Every rung gets a `nudge` column that takes a pixel-free `ArmDelta`.
- A generic persisted-value table replaces the splash-only localStorage writer.

**Tech stack:** TS, Vitest, RTK (no react-redux), wgpu-matrix.

**Spec:** [`docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md`](../specs/2026-09-29-openspace-camera-mode-design.md), §3 (Ground preparation) and §8 (`lookOffset`).

## Global constraints

- Behaviour-neutral. No existing test changes its expected values. The camera goldens (`tests/**/golden*`) stay byte-identical.
- `type` aliases, never `interface`. One type per `@types/` file, one function per `utils/` file, with filename = symbol.
- Frame files (`src/services/engine/frame/**`) export only their named symbol.
- File moves use `npm run move-files -- <from> <to>`, never `git mv`.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines.
- Each prep item is its own commit (or a pair, for P1). Format with `npx prettier --write <files>`, never `npm run format`.
- No `Co-Authored-By` lines in commits.

## Review focus

1. **Nudge vs drag parity.** A `nudge` with the screen-angle equivalent of a pixel drag must produce the same pose as that drag, on all three arms. A unit slip (px vs rad, or a sign) shows only as a camera that moves too fast or backwards. Pinned by the parity tests in Task 5.
2. **`lookOffset = 0` must be exactly neutral.** An absent offset and `[0, 0]` must give byte-identical view matrices, or every golden drifts. Pinned in Task 3.
3. **Body-arm settle extraction.** Floor, level with held azimuth, and the tilt-memory write must run in the same order as today. The existing `surfaceStep.test.ts` and `rememberedTilt.test.ts` must pass untouched; they are the gate.
4. **Splash persistence regression.** A returning user whose splash is dismissed must not see it again, and a private-mode storage throw must not break boot. Pinned in Task 6.
5. **URL round-trip with no offset.** An existing `#pose=` link (without offset fields) must decode unchanged, and a pose with zero offset must encode to exactly today's string. Pinned in Task 3.

---

### Task 1 (P2): Driver activity bag — `review: yes`

**Files:**
- Create: `src/@types/engine/camera/DriverActivity.d.ts`
- Modify: `src/@types/engine/camera/CameraDriver.d.ts:28`
- Modify: `src/services/engine/camera/cameraDrivers.ts:46-58` (`pickWinner`) and `:275` (`followApproach.isActive`)
- Modify: `src/services/engine/camera/stepCameraRuntime.ts:163-167`
- Modify: `tests/services/engine/camera/cameraDrivers.test.ts`, `tests/services/engine/camera/stepCameraRuntime.test.ts` (call-site updates only)

**Contract:**
```ts
export type DriverActivity = { readonly approachDone: boolean };
isActive(s: RootState, activity: DriverActivity): boolean;         // was (s, approachDone?)
pickWinner(drivers, s: RootState, activity: DriverActivity): CameraDriver;
```
`stepCameraRuntime` builds `{ approachDone }` once, where today it computes `approachDone`, and passes it to `pickWinner`. The activity is required; no row defaults it.

- [x] Change the type and every call site; `followApproach` reads `activity.approachDone`.
- [x] No new test: this is a signature change the compiler checks. The existing driver tests are the gate.
- [x] `npm run typecheck:fast && npm test -- camera` is green. Commit: `refactor(camera): driver activity bag replaces approachDone arg`.

### Task 2 (P3): Control-scheme registry

**Files:**
- Create: `src/@types/engine/camera/ControlSchemeId.d.ts`
- Create: `src/@types/engine/camera/ControlScheme.d.ts`
- Create: `src/services/engine/camera/controlSchemes.ts`
- Modify: `src/@types/engine/frame/RunFrameDeps.d.ts:40-45`, `src/services/engine/frame/runFrame.ts:134`, `src/services/engine/phases/startLoop.ts:47`
- Modify: `tests/helpers/camera/simulateCameraFrame.ts`, `tests/helpers/camera/makeCameraSimHarness.ts`, `tests/services/engine/frame/runFrame.test.ts` (fixture shape only)

**Contract:**
```ts
export type ControlSchemeId = 'skymap';                              // PR 2 widens it
export type ControlScheme = { readonly drivers: readonly CameraDriver[] };
export const CONTROL_SCHEMES: Readonly<Record<ControlSchemeId, ControlScheme>> =
  { skymap: { drivers: CAMERA_DRIVERS } };
// RunFrameDeps: `drivers` → `controlSchemes: Readonly<Record<ControlSchemeId, ControlScheme>>`
```
- `runFrame` resolves `deps.controlSchemes.skymap.drivers` into `StepInputs.drivers`, which is unchanged. PR 2 swaps the literal key for the settings read.
- A fixture overrides the table as `{ skymap: { drivers: [...] } }`.

- [x] Implement. `runFrame.ts` still exports only `runFrame` (frame purity ratchet: `tests/services/engine/frame/frameFilePurity.test.ts`).
- [x] No new test: plumbing only.
- [x] Green. Commit: `refactor(camera): driver table behind a control-scheme registry`.

### Task 3 (P5): `CameraPose.lookOffset` — `review: yes`

**Files:**
- Modify: `src/@types/camera/CameraPose.d.ts`, `src/@types/camera/OrbitCamera.d.ts` (or its `OrbitCameraInit`)
- Modify: `src/utils/camera/orbitForwardOf.ts` (the single forward decode; readers: `computeViewProj`, `turnedOrbitCamera`, `slabs.ts`, `frameContext.ts`)
- Modify: `src/services/engine/camera/assembleOrbitCamera.ts:49` (copy the field like `roll`)
- Modify: `src/utils/url/encodeFramedPose.ts`, `src/utils/url/decodeFramedPose.ts:65`
- Modify: the tween row's lerp at `src/services/engine/camera/cameraDrivers.ts:180` and the carry at `:140`
- Audit, and modify as needed: every other `roll` reader. The current list is `reencodePose`, `poseFrameConversion`, `releasedWorldArm`, `tweenToClip`, `evaluateClip`, `approachTiltedPose`, `applyFocusedBodyPivot`, `frameAlignedRoll`, `cameraDofAnglesOf`, `replayInput`, `projectFramePose`, `horizonShellRenderer`, `zoneOfAvoidanceRenderer` (`grep -rlE "pose\.roll|\.roll \?\?" src`).
- Test: `tests/utils/camera/orbitForwardOf.test.ts` (create or extend), `tests/utils/url/encodeFramedPose.test.ts`, `tests/utils/url/decodeFramedPose.test.ts`

**Contract:**
```ts
export type CameraPose = { target: Vec3; yaw: number; pitch: number; distance: number;
  roll?: number;
  /** [yaw, pitch] rad turning the VIEW about the eye after the orbit terms place it; absent ⇒ [0, 0]. */
  lookOffset?: Vec2 };
```
- **Semantics.** The eye position is untouched: `updatePosition` never reads `lookOffset`. `orbitForwardOf` turns the decoded forward first by `lookOffset[0]` about the frame up (`frameUp(upBasis)`), then by `lookOffset[1]` about the resulting right axis. `imagePlaneBasis` then re-derives up, so the horizon stays level.
- **Absent or `[0, 0]`.** This takes the exact existing code path. Short-circuit, so there is no floating-point drift.
- **Per-reader rule for the audit:**
  - A site that builds a view reads the offset only through `orbitForwardOf`.
  - A site that interpolates two poses lerps the offset toward the target's (the tween's target has none, so it eases to 0).
  - A site that re-encodes between orientation frames carries it unchanged (it is view-local).
  - A site that converts to a body-fixed or site frame drops it. This is spec §8: disengage zeroes, and PR 2 revisits it only if the eye-check objects.
  - Clips author no offset, so a clip starting from an offset pose snaps to 0 at its start. That is accepted and needs no clip-channel change.
- **R12b-3 comment** at `src/state/camera/cameraSlice.ts:56`: reword to "every committed ABSOLUTE pose's orbit terms are centre-looking; `lookOffset` turns only the view."
- **URL.** Encode the two extra numbers only when the offset is non-zero, as trailing fields after `roll`. Decode accepts both lengths.

- [x] Test `orbitForwardOf keeps the eye and turns forward by lookOffset`: with a non-zero offset, `position` is unchanged, and the angle between the new and old forward equals `hypot` of the offset (small-angle case) or the exact composed angle (test at [0.3, 0] and [0, 0.2]).
- [x] Test `orbitForwardOf with lookOffset [0,0] is bitwise identical to absent`: `Float64Array` equality of the forward and of the `computeViewProj` matrix.
- [x] Test `encodeFramedPose omits a zero lookOffset`: a pose with `[0, 0]` encodes to the same string as without the field.
- [x] Test `framed pose round-trips a non-zero lookOffset through the hash`: encode then decode returns the offset within 1e-12.
- [x] Test `tween eases lookOffset to zero`, in the existing tween-row test file: at t=0.5 it is half the start offset, and at t=1 it is 0.
- [x] Implement and run the audit. Every existing test and golden stays green, unchanged.
- [x] Commit: `feat(camera): CameraPose.lookOffset — view turn about the eye, neutral at zero`.

### Task 4 (P1a): Extract the body arm's orbit, look and settle — `review: yes`

**Files:**
- Create: `src/utils/camera/orbitedSurfacePose.ts`, `src/utils/camera/lookedSurfacePose.ts`, `src/utils/camera/settledDragPose.ts`
- Create (if not already present as types): `src/@types/camera/SettleCtx.d.ts`
- Modify: `src/utils/camera/draggedSurfacePose.ts:58-73`, `src/services/camera/surfaceStep.ts:114-157`

**Contract:**
```ts
// The existing drag's rate law: yaw/pitch in SCREEN radians (px / cssHeight · fovY), signs as the drag's.
orbitedSurfacePose(arm: BodyFixedPose, yawRad: number, pitchRad: number): BodyFixedPose;  // was draggedSurfacePose :58-64
lookedSurfacePose(arm: BodyFixedPose, yawRad: number, pitchRad: number): BodyFixedPose;   // was :66-73
settledDragPose(
  entry: BodyFixedPose,                 // the pose BEFORE the move (for the held entry azimuth)
  moved: BodyFixedPose,
  mode: SurfaceGestureMode,             // the existing mode union, as surfaceStep uses it
  tilt: TiltMemory,
  ctx: SettleCtx,                       // groundRadiusAtM, standoffRadii, bodyRadiusM, tuning
): { pose: BodyFixedPose; tilt: TiltMemory };   // floor → level (held azimuth for pan|orbit, none for strafe) → tilt-memory write for tilt|look
```
`draggedSurfacePose` and `surfaceStep` call these helpers, with no logic change. This is extraction only.

- [x] No new test. `tests/services/camera/surfaceStep.test.ts`, `rememberedTilt.test.ts` and `singularLocusRecession.test.ts` are the parity gate and must stay green unchanged.
- [x] Commit: `refactor(camera): extract body-arm orbit/look solves and the drag settle`.

### Task 5 (P1b): `ArmDelta` + `RungRow.nudge` — `review: yes`

**Files:**
- Create: `src/@types/camera/ArmDelta.d.ts`, `src/@types/camera/NudgeCtx.d.ts` (if `RungCtx` doesn't suffice, reuse it)
- Create: `src/utils/camera/nudgedWorldPose.ts`, `src/utils/camera/nudgedSurfacePose.ts`, `src/utils/camera/nudgedSitePose.ts`, `src/utils/camera/rollBasisAboutView.ts`
- Modify: `src/@types/camera/RungRow.d.ts`, `src/services/engine/camera/rungs/{absoluteRung,bodyRung,siteRung}.ts`
- Test: `tests/utils/camera/nudgedWorldPose.test.ts`, `tests/utils/camera/nudgedSurfacePose.test.ts`, `tests/utils/camera/nudgedSitePose.test.ts`

**Contract:**
```ts
/** One frame's pixel-free motion. orbit/look/roll are SCREEN radians (a drag of one CSS
 *  height = one fovY), signed as the pixel drag (+x = rightward, +y = downward);
 *  zoom is ln(distance factor), > 0 = farther. Absent axis = no motion. */
export type ArmDelta = { readonly orbit?: Vec2; readonly look?: Vec2; readonly zoom?: number; readonly roll?: number };

// RungRow<K> gains:
nudge(tilt: TiltMemory, framed: FramedPose<K>, delta: ArmDelta, ctx: RungCtx):
  { readonly pose: PoseOf[K]; readonly tilt: TiltMemory };
// A delta the rung ignores entirely returns framed.pose BY REFERENCE (the same identity rule as step).
```
**Per-rung semantics.** Carry these into the cells exactly.
- **absolute (`nudgedWorldPose`):**
  - orbit: convert screen radians to that drag's pixels (`rad · cssHeight / fovY`), then apply `applyInputToCamera`'s orbit law (the `orbitRadPerPixel` altitude damping and `PITCH_LIMIT` clamp).
  - zoom: `zoomedDistance(d, exp(zoom), pivot)`.
  - roll: `roll + delta.roll`.
  - look: `lookOffset + delta.look`, with pitch clamped to `±(π/2 − 0.01)`.
- **body (`nudgedSurfacePose`):** apply the axes in the order zoom → orbit → look → roll:
  - zoom: `surfaceZoomStep(arm, null, exp(zoom), null, …)`, anchored at screen centre.
  - orbit: `orbitedSurfacePose`.
  - look: `lookedSurfacePose`.
  - roll: `rollBasisAboutView(basisLocal, rad)`, which rotates right and up about forward and stays orthonormal.

  Then run **one** `settledDragPose`. The mode is `'orbit'` when orbit alone moved, `'look'` when look moved (it writes the tilt memory), and the floor-only branch when roll moved. Roll must skip the level step, because the level settle would undo it: the body arm rules that no *drag* may roll, and `nudge` is not a drag.
- **site (`nudgedSitePose`):** orbit uses `steppedSitePose`'s gain law (`steppedSitePose.ts:25-37`) with pixels = `rad · cssHeight / fovY`. Zoom multiplies range by `spentZoomFactor(exp(zoom))`, with the declined-notch identity. Look and roll are ignored.

- [x] Test `world nudge orbit equals the equivalent pixel drag`: for a pose over Earth with a pivot radius, `nudgedWorldPose({orbit:[a,b]})` equals `applyInputToCamera` with a drag of `(a,b)·cssHeight/fovY` px, within 1e-12.
- [x] Test `world nudge zoom matches zoomedDistance` and `world nudge look accumulates lookOffset and clamps pitch`.
- [x] Test `body nudge orbit equals the equivalent orbit-mode drag`: the same pose as the drag path with the gesture latched to `'orbit'`, within 1e-9 m. Build the drag through `surfaceStep` with a pre-latched orbit gesture.
- [x] Test `body nudge roll keeps basisLocal orthonormal and survives the settle`: after `roll: 0.2`, the basis is orthonormal to 1e-12 and the image roll relative to the pre-pose is 0.2 ± 1e-9 (i.e. the level step didn't eat it).
- [x] Test `site nudge ignores look and roll by reference` and `site nudge orbit equals the equivalent drag`.
- [x] Implement. `step` is untouched.
- [x] Commit: `feat(camera): RungRow.nudge — pixel-free per-arm motion column`.

### Task 6 (P4): Persisted-value table — `review: yes`

**Files:**
- Create: `src/@types/state/PersistedValue.d.ts`, `src/utils/storage/readPersisted.ts`, `src/utils/storage/persistValues.ts`, `src/state/persistedValues.ts`
- Modify: `src/state/ui/splashStorage.ts`: remove `readSeenVersion`/`writeSeenVersion` and `SPLASH_STORAGE_KEY` (the key moves to its row); keep `CURRENT_SPLASH_VERSION` and `readUrlAtMount`.
- Modify: `src/state/ui/buildInitialUiState.ts`, `src/hooks/useSplash.ts`, `src/main.tsx:96`
- Delete: `src/state/ui/persistSplashVersion.ts`, `tests/state/ui/persistSplashVersion.test.ts`
- Test: `tests/utils/storage/readPersisted.test.ts`, `tests/utils/storage/persistValues.test.ts`; update `tests/state/ui/splashStorage.test.ts`, `tests/hooks/useSplash.test.ts`, `tests/state/ui/buildInitialUiState.test.ts` for the moved functions.

**Contract:**
```ts
export type PersistedValue<T> = {
  readonly key: string;                          // never rename without a migration
  readonly select: (s: RootState) => T;
  readonly parse: (raw: string) => T | null;     // null ⇒ caller's default
  readonly serialize: (v: T) => string;
  readonly skip?: (v: T) => boolean;             // splash: null is not a dismissal
};
readPersisted<T>(row: PersistedValue<T>): T | null;     // SSR/private-mode/throw ⇒ null
persistValues(store: AppStore, rows: readonly PersistedValue<unknown>[]): () => void;
  // one subscribe; per row, a diff against the value snapshotted BEFORE subscribing; writes swallow errors
export const PERSISTED_VALUES = [SPLASH_SEEN_VERSION] as const;   // src/state/persistedValues.ts; PR 2 appends cameraControls
```
The splash row keeps key `'skymap.splash.seenVersion'` verbatim.

- [x] Test `readPersisted returns null when storage throws` (stub `localStorage.getItem` to throw) and `readPersisted returns null for an unparsable value`.
- [x] Test `persistValues writes only on change and not at install`: seed a non-null value, install, and dispatch an unrelated action, so there is no write; change the value, so there is exactly one write.
- [x] Test `persistValues swallows a throwing setItem`.
- [x] Port the surviving assertions of `persistSplashVersion.test.ts` (no write on `reopenSplash`, no write for null) onto the splash row, then delete that file.
- [x] Commit: `refactor(state): generic persisted-value table; splash version moves onto it`.

---

## Definition of Done

- **Deliverables:**
  - `DriverActivity`, `ControlScheme`/`ControlSchemeId`, `CONTROL_SCHEMES`;
  - `CameraPose.lookOffset` read through `orbitForwardOf`;
  - `ArmDelta` and `RungRow.nudge` on all three rungs;
  - `orbitedSurfacePose`/`lookedSurfacePose`/`settledDragPose`;
  - `PersistedValue`, `readPersisted`, `persistValues`, `PERSISTED_VALUES`;
  - `persistSplashVersion.ts` deleted.
- **Manual smoke (skymap scheme, user):**
  - world-arm orbit/pan/wheel;
  - body-arm grab-pan, look to the sky, tilt, wheel-to-cursor;
  - site-arm turntable;
  - a focus tween and a clip;
  - a `#pose=` deep link from before this branch opens the same view;
  - the splash stays dismissed across a reload.
- **Out of scope (PR 2):**
  - the `openspace` scheme id, `NavAxis`, navigator state, the `navDrag` input kind, `bindAxis` on orbitControls;
  - the two driver rows, the `cameraControls` settings cluster and its persisted row, the `shift+c` shortcut, the settings UI, the wake term;
  - the Q8 note in the grill file.
