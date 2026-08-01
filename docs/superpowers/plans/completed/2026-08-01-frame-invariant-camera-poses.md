# Frame-Invariant Camera Poses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An orientation-frame change rolls the horizon and leaves the eye and its aim untouched — uniformly, whether it comes from the Settings panel or a `frameTo` cue inside a clip.

**Architecture:** `OrbitCamera`'s single `frameBasis` field is split into `poseBasis` (the basis `yaw`/`pitch` decode through) and `upBasis` (the basis screen-up is read from). `poseBasis` is the committed frame and jumps once at switch start; `upBasis` is `resolveFrameBasis`'s slerped `B(t)`. Poses authored under one basis are carried into another by a single pure `reencodePose`, applied where a pose is produced — never in the render path.

**Tech Stack:** TypeScript, Vitest, redux-toolkit + typed-redux-saga, wgpu-matrix.

**Spec:** [`docs/superpowers/specs/completed/2026-08-01-frame-invariant-camera-poses.md`](../../specs/completed/2026-08-01-frame-invariant-camera-poses.md)

## Global Constraints

- `type` aliases, never `interface`. One exported function per file in `src/utils/`, one type per file in `src/@types/`; filename = symbol name; deep relative imports, no barrels.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. Comments record why, never what.
- Any file move or rename goes through `npm run move-files` / `npm run refactor`, never `git mv` plus hand-edited imports.
- Tests must be able to fail on a real bug no other test or compiler check catches. No runtime type tests, no constant restatements, no clamp-boundary mirrors.
- At rest `poseBasis === upBasis`, so every path that never switches frames must stay byte-identical. Any task that changes behaviour at rest is a defect.
- The full suite stays green at every commit.

---

### Task 1: `buildPathTrack` decodes through the frame basis

The aim is encoded through `frameBasis` (`orbitAnglesLookingAlong`, lines 353 and 598) but the live eye and the derived look-at target are reconstructed with a bare `yawPitchToDir`. Both sites were touched by the frame-switch commit `2c97e7fe` and neither took the basis.

**Files:**

- Modify: `src/services/engine/animation/buildPathTrack.ts:257`, `:620`
- Test: `tests/services/engine/animation/buildPathTrack.test.ts`

**Interfaces:** no signature change — `BuildParams.frameBasis` already exists and is already threaded in.

- [x] Add `flyPath starts at the live eye under a non-identity frame`: build a track with `frameBasis: ORIENTATION_FRAMES.ecliptic`, `start = { target: [0,0,0], distance: 10, yaw: 0.3, pitch: 0.1 }`, waypoints `[{ at: [100,20,0], distance: 5 }, { at: [200,-40,60], distance: 8 }]`. Reconstruct the eye the renderer does — `target + distance · (frameBasis · yawPitchToDir(yaw, pitch))` — from `sample(0)` and assert it equals the live eye `[2.9, 1.0, 9.5]` (3 dp).
- [x] Add `flyPath settles at the framing distance from its destination under a non-identity frame`: same track, assert the reconstructed eye at `sample(totalSec)` is 8.0 from `[200,-40,60]` (3 dp).
- [x] `npm test -- buildPathTrack` → RED on the settle assertion (≈14.6). The `t=0` assertion does NOT go red: the two omissions cancel there (align-in weight 0 ⇒ the aim is the live pose and the spline sits on knot 0, so the wrong knot and wrong target subtract out). Keep it as a guard against fixing only one of the two sites.
- [x] Rotate the frame-local direction through `frameBasis` at both sites, reusing the tight column-major product spelled out at `updatePosition.ts:69-71` (the registry `Mat3` is 9-float, not wgpu-matrix's 12-float padded layout — `vec3.transformMat3` would read garbage).
- [x] `npm test -- buildPathTrack` → GREEN, and the pre-existing identity-frame cases unchanged.
- [x] Commit.

---

### Task 2: `sampleClipPath` reconstructs the inspector eye through the basis

Same omission, debug-inspector side. `eyeOf` (`sampleClipPath.ts:32-39`) draws the clip-path overlay at the wrong place under any non-identity frame.

**Files:**

- Modify: `src/services/engine/animation/sampleClipPath.ts`, and its caller `src/state/camera/watchClipPathInspectSaga.ts` (already holds a basis)
- Test: `tests/services/engine/animation/sampleClipPath.test.ts`

**Interfaces:**

- Produces: `sampleClipPath(clipId, data, durationSec, sampleCount, frameBasis?: Mat3): ClipPathSnapshot`

- [x] Add `inspector eye matches the rendered eye under a non-identity frame` — same reconstruction as Task 1, one sample.
- [x] `npm test -- sampleClipPath` → RED.
- [x] Thread the basis into `eyeOf` and pass it from the saga; `evaluateClip` inside already takes one.
- [x] `npm test -- sampleClipPath watchClipPathInspectSaga` → GREEN.
- [x] Commit.

---

### Task 3 (prep): split `frameBasis` into `poseBasis` + `upBasis`

Behaviour-neutral. Both fields are fed the same value; this task only creates the joint. The suite is the proof — no test should change.

**Files:**

- Modify: `src/@types/camera/OrbitCamera.d.ts`, `src/services/engine/camera/assembleOrbitCamera.ts`, `src/services/engine/frame/runFrame.ts`, `src/services/engine/frame/frameContext.ts`, `src/services/camera/orbitControls.ts`, `src/services/camera/createOrbitCamera.ts`, `src/services/camera/seedCameraFromBase.ts`, `src/utils/camera/computeViewProj.ts`, `src/utils/camera/cameraBillboardBasis.ts`, `src/services/gpu/renderers/horizonShell/horizonShellRenderer.ts`, `src/services/engine/frame/slabs.ts`, `src/services/engine/helpers/pickFrameContext.ts`

**Interfaces:**

- Produces: `OrbitCamera.poseBasis?: Mat3` (renamed from `frameBasis`), `OrbitCamera.upBasis?: Mat3` (new). `assembleOrbitCamera(pose, projection, poseBasis, upBasis)`.

**Routing rule** — draw-time reads take `upBasis`, compile-time reads take `poseBasis`:

| site                                                                                                          | reads       |
| ------------------------------------------------------------------------------------------------------------- | ----------- |
| `updatePosition` (7 call sites), `orbitAnglesLookingAlong` (4 call sites)                                     | `poseBasis` |
| `computeViewProj:98`, `cameraBillboardBasis:66`, `horizonShellRenderer:161`, `slabs:156`, `orbitControls:415` | `upBasis`   |
| `resolveClipFoci:185`, `buildPathTrack:190` (strafe / pass-by lateral axes)                                   | `poseBasis` |

`npm run refactor -- rename` does **not** apply here: it resolves exported declarations only (`tools/utils/refactor/resolveSymbol.ts:48`), and `frameBasis` is a property of an exported type. Rename it by hand or via the editor's rename-symbol. The type checker is the safety net — every read site of a renamed property is a type error, so a green `npm run typecheck` means none were missed.

- [x] Rename the property on `OrbitCamera` and update every read/write site; then grep for `frameBasis` to catch what the type checker cannot see (`.wesl` sources, string literals, `vi.mock` factories, comments).
- [x] Add `upBasis` to `OrbitCamera` and to `assembleOrbitCamera`'s parameters; every caller passes the same value for both.
- [x] Reroute the five draw-time sites in the table to `cam.upBasis`.
- [x] `npm run typecheck && npm test` → GREEN. Test fixtures that construct an `OrbitCamera` need the field renamed too — that is expected. What must NOT change is any test's expected **values**: if an assertion's expected number or vector moves, the split changed behaviour. Stop and find out why.
- [x] Commit.

---

### Task 4 (prep): `reencodePose`

**Files:**

- Create: `src/utils/camera/reencodePose.ts`
- Test: `tests/utils/camera/reencodePose.test.ts`

**Interfaces:**

- Produces: `reencodePose(pose: CameraPose, from: Mat3 | undefined, to: Mat3 | undefined): CameraPose`

**Behaviour:** re-expresses `yaw`/`pitch` so the world direction from `target` toward the eye is unchanged. `target` and `distance` pass through. `from === to` (including both `undefined`) returns the input **by reference** — the identity case is the common one and must not allocate. Composition of `yawPitchToDir` under `from` and `orbitAnglesLookingAlong` under `to`; no new math.

- [x] Add `preserves the world eye direction across a basis change` — assert `to · dir(out)` equals `from · dir(in)` componentwise for an ecliptic → galactic pair.
- [x] Add `returns the input by reference when the bases are identical` — assert `toBe`, not `toEqual`.
- [x] `npm test -- reencodePose` → RED.
- [x] Implement.
- [x] `npm test -- reencodePose` → GREEN.
- [x] Commit.

---

### Task 5: `upBasis` slerps, `poseBasis` holds the committed frame

The two fields diverge for the first time. Only during a roll.

**Files:**

- Modify: `src/services/engine/frame/runFrame.ts:353-364`, `:520-532`
- Test: `tests/services/engine/frame/runFrame.test.ts`

- [x] Add `during a frame roll the assembled camera position is unchanged while its up rotates` — drive a store with a `frameTween` in flight and a fixed `base`, run two frames, assert `cam.position` identical across them and `frameUp(cam.upBasis)` different.
- [x] `npm test -- runFrame` → RED.
- [x] Feed `poseBasis = ORIENTATION_FRAMES[rootState.settings.orientation]` and `upBasis = resolveFrameBasis(...)` to `deriveFrameContext` and to `state.cam`. `state.cameraRuntime.frameBasis.current` keeps taking `B(t)` — it seeds the next switch's `fromQuat` and must stay the live basis. (It was renamed `upBasis` at the end of the branch, once it was clear that is exclusively what it holds.)
- [x] `npm test -- runFrame frameContext` → GREEN.
- [x] Commit.

---

### Task 6: an orientation switch re-expresses the committed pose

**Files:**

- Modify: `src/state/camera/watchOrientationChangeSaga.ts`, `src/store/types.ts` (`LiveCameraRuntime`), `src/services/engine/engine.ts:719`
- Test: `tests/state/camera/watchOrientationChangeSaga.test.ts`

**Interfaces:**

- Produces: the saga selects the outgoing orientation and `camera.base` BEFORE any write, then dispatches `setOrientation(frame)`, `commitCameraPose(reencodePose(base, ORIENTATION_FRAMES[previous], ORIENTATION_FRAMES[frame]))`, and — only if the camera runtime is non-null — `startFrameTween({...})`.

The `from` argument is the **outgoing registry frame**, NOT the live basis. A stored pose's angles are only valid in a committed frame (`poseBasis` never mid-slerps), so the live blend is a basis `base` was never expressed in. The two agree unless a switch fires during a roll, which is exactly the case that breaks. `fromQuat` keeps the live basis — it governs the up vector's slerp start, a different question. Do not unify them.

The re-encode goes ABOVE the null-runtime bail: it needs no camera, and below it a pre-bootstrap switch would persist the frame while leaving `base` in the old basis.

- [x] Add `a switch commits a pose whose world eye direction is unchanged` — assert the `commitCameraPose` payload re-decodes to the pre-switch world direction.
- [x] Add `a switch fired mid-roll re-expresses from the outgoing registry frame` — fire a second switch during an in-flight roll whose live basis is genuinely neither endpoint, and assert the committed pose's EYE POSITION (decoded through `ORIENTATION_FRAMES[destination]` the way `updatePosition` does) matches the pre-switch eye decoded through `ORIENTATION_FRAMES[previous]`. Verify it goes RED against a live-basis `from`; if it does not, the fixture's live basis is not distinct enough — fix the fixture, not the assertion.
- [x] `npm test -- watchOrientationChangeSaga` → RED.
- [x] Implement; the null-runtime path still degrades to `setOrientation` alone (nothing to re-express without a camera).
- [x] `npm test -- watchOrientationChangeSaga` → GREEN.
- [x] Commit.

---

### Task 7: a clip pins the frame it started under

`evaluateClip`'s cache keys on the basis it is handed (`evaluateClip.ts:114-123`) and the driver hands it the live setting every frame (`cameraDrivers.ts:232`), so a switch mid-clip silently recompiles the clip under the new pole and reinterprets every authored `yaw` against it.

**Files:**

- Modify: `src/@types/camera/CameraState.d.ts:29`, `src/state/camera/cameraSlice.ts` (the `playClip` reducer), `src/services/engine/camera/cameraDrivers.ts:217-233`, and every `playClip` dispatch site (`src/state/tour/visitBeatSaga.ts:97` already selects the orientation)
- Test: `tests/services/engine/camera/cameraDrivers.test.ts`, `tests/state/camera/cameraSlice.test.ts`

**Interfaces:**

- Produces: `CameraState['clip']` becomes `{ data: ClipData; frame: OrientationFrameId } | null`. The clip driver's `pose` evaluates against `ORIENTATION_FRAMES[clip.frame]` and re-encodes the result into `ORIENTATION_FRAMES[settings.orientation]`.

- [x] Add `a clip playing across an orientation switch keeps its world aim` — evaluate the same clip at the same elapsed under `orientation: 'ecliptic'` and `'galactic'` with `clip.frame: 'ecliptic'`; assert both poses decode (through their respective settings bases) to the same world direction.
- [x] `npm test -- cameraDrivers` → RED.
- [x] Add the field, thread it from the dispatch sites, and re-encode in the driver row.
- [x] `npm test -- cameraDrivers cameraSlice watchClipSaga visitBeatSaga` → GREEN.
- [x] Commit.

---

### Task 8: the focus tween pins its frame the same way

`tweenToClip` converts a descriptor whose `from`/`to` poses were captured under the basis live at capture time; the tween driver (`cameraDrivers.ts:356`) passes no basis at all.

**Files:**

- Modify: `src/@types/camera/CameraTweenDescriptor.d.ts`, `src/state/camera/focusTweenDescriptor.ts`, `src/state/selection/watchFocusTweenSaga.ts`, `src/services/engine/camera/cameraDrivers.ts:346-357`
- Test: `tests/state/camera/focusTweenDescriptor.test.ts`, `tests/state/selection/watchFocusTweenSaga.test.ts`

**Interfaces:**

- Produces: `CameraTweenDescriptor` gains `frame: OrientationFrameId`, captured where the descriptor is built. The tween driver re-encodes its evaluated pose from that frame into the current one.

- [x] Add `a focus tween running across an orientation switch keeps its world aim` — same shape as Task 7's test.
- [x] `npm test -- focusTweenDescriptor` → RED.
- [x] Implement.
- [x] `npm test -- focusTweenDescriptor watchFocusTweenSaga watchGoHomeSaga` → GREEN.
- [x] Commit.

---

### Task 9: `spinToId` — a bearing is a sightline, not a number

**Files:**

- Modify: `src/@types/animation/Effect.d.ts`, `src/services/engine/animation/effectHelpers.ts`, `src/services/engine/animation/resolveClipFoci.ts`
- Test: `tests/services/engine/animation/resolveClipFoci.test.ts`, `tests/services/engine/animation/effectHelpers.test.ts`

**Interfaces:**

- Produces: `spinToId(focus: FocusId, opts: { over: number; turns?: number; ease?: Ease }): Effect`

**Behaviour:** an unresolved effect, rewritten by `resolveClipFoci` into `spin('yaw', { by, over, ease })` where `by = bearing − liveYaw + turns · 2π`. `bearing` comes from `orbitAnglesLookingAlong(focusPos − livePose.target, frameBasis)`. `turns` defaults to 0; negative values take the long way round (the tour's existing idiom — see the `- Math.PI * 2` at `approachM31.ts:57`). Resolution follows the `lookAtId` arm at `resolveClipFoci.ts:155-165`; `compileClip` must throw on an unresolved `spinToId` exactly as it does for the other five focus-bound kinds (`compileClip.ts:277-283`).

- [x] Add `spinToId resolves to a spin whose landing yaw faces the focus` — assert `liveYaw + by` decodes to the focus direction.
- [x] Add `spinToId lands the same world bearing under two different bases` — resolve the same effect under ecliptic and galactic; assert both landings decode to the same world direction. This is the whole point of the arm.
- [x] Add `spinToId honours turns` — `turns: -1` yields a `by` exactly `2π` less than `turns: 0`.
- [x] Add `compileClip throws on an unresolved spinToId`.
- [x] `npm test -- resolveClipFoci effectHelpers compileClip` → RED.
- [x] Implement.
- [x] → GREEN. Commit.

---

### Task 9b: `dwellDrift` can orbit to a bearing

`dwellDrift` builds its own yaw spin from a `cruiseRate` scalar (`dwellDrift.ts:84`), so a beat cannot substitute `spinToId` without abandoning the dwell primitive and re-authoring its pitch bob. One named option keeps a single dwell primitive.

**Files:**

- Modify: `src/state/tour/dwellDrift.ts`
- Test: `tests/state/tour/dwellDrift.test.ts`

**Interfaces:**

- Produces: `dwellDrift(durationSec, opts?: { rampSec?; cruiseRate?; spinTo?: FocusId; turns?: number })`

**Behaviour:** with `spinTo` set, the yaw layer becomes `spinToId(spinTo, { over: durationSec, turns, ease: 'easeInOutCubic' })` and `cruiseRate` is ignored; the pitch bob is untouched. Without it, byte-identical to today. `spinTo` and `cruiseRate` together is an authoring error — throw, rather than silently picking one (the named-options header at `dwellDrift.ts:36-41` records why this file is strict about ambiguous knobs).

- [x] Add `dwellDrift with spinTo emits an unresolved spinToId on the yaw layer` and `dwellDrift with both spinTo and cruiseRate throws`.
- [x] `npm test -- dwellDrift` → RED.
- [x] Implement.
- [x] `npm test -- dwellDrift` → GREEN. Commit.

---

### Task 10: delete the six frame-local constants

**Files:**

- Modify: `src/data/animation/tours/grandTour/approachM31.ts:48-61`, `src/data/animation/tours/grandTour/localGroup.ts:82-92`, `src/data/animation/tours/grandTour/openingTitle.ts:75`, `src/data/animation/tours/grandTour/homeAgain.ts:45`, `src/services/engine/camera/cameraFraming.ts:50-55`
- Test: `tests/data/animation/tours/` (existing beat tests), `tests/services/engine/camera/cameraFraming.test.ts`

Deleted: `ARRIVAL_YAW_RAD` and `EXIT_YAW_RAD` in both `approachM31.ts` and `localGroup.ts`; `GALACTIC_DISC_YAW_RAD` and `GALACTIC_DISC_PITCH_RAD` in `cameraFraming.ts`.

`REVEAL_NET_YAW_RAD` (`neighbourhoodReveal.ts`) was expected to survive — it is a rate, not a bearing. It did not, and the reason is worth recording: the M81 landing turned out to belong on `neighbourhoodReveal`'s dwell rather than `localGroup`'s, because the invariant is "facing M81 when the flythrough starts". Once that dwell resolves its own landing through `spinTo`, the rate it used to run at has nothing left to express, and the cross-beat coupling `localGroup` encoded by subtracting it disappears with it.

- [x] Replace the two dwell `cruiseRate` computations with `dwellDrift(DWELL_SEC, { spinTo: focusId('group-m81-group'), turns: -1 })`, preserving each beat's existing sweep direction and duration. `turns: -1` reproduces the `- Math.PI * 2` both beats apply today.
- [x] Replace `aimAt({ yaw: GALACTIC_DISC_YAW_RAD, pitch: GALACTIC_DISC_PITCH_RAD }, …)` in `openingTitle.ts` and `homeAgain.ts` with a `lookAtId`-style resolution of the same sightline. The opening's zero-duration `aimAt` must still snap (the cold-open idiom), and the two beats must resolve to the SAME pose — `homeAgain` exists to land back on the opening framing.
- [x] Update the beat module headers: the paragraphs explaining re-derivation of the constants describe machinery that no longer exists.
- [x] `npm run typecheck && npm test` → GREEN.
- [x] Commit.

---

### Task 11: the tour captures and restores `orientation`

Without this a tour `frameTo` permanently changes the viewer's setting.

**Files:**

- Modify: `src/@types/engine/tour/SceneSnapshot.ts`, `src/state/tour/captureScene.ts`, the restore path in `src/state/tour/restoreSceneSaga.ts`
- Test: `tests/state/tour/captureScene.test.ts`, `tests/state/tour/restoreSceneSaga.test.ts`, `tests/state/tour/guidedTourSaga.test.ts`

- [x] Add `a tour that changed the orientation restores the viewer's frame` — end-to-end through capture and restore.
- [x] `npm test -- captureScene restoreSceneSaga` → RED.
- [x] Carry `orientation` on `SceneSnapshot`, beside `focus` — NOT on `SettingsSnapshot`. `guidedTourSaga` merges a settings snapshot before every beat and `mergeSettingsSnapshot` spreads every key, so a scalar living there is raw-written back at each boundary and reverts the pole the previous beat authored. `src/state/tier/tierSlice.ts:5-12` records lifting `tier` out of settings for exactly this reason.
- [x] Restore must dispatch `requestOrientationChange`, never write the setting — a raw write leaves `camera.base` in the outgoing basis.
- [x] Add the `guidedTourSaga`-level guard: no `mergeSnapshot` payload carries `orientation`. Verify RED.
- [x] → GREEN. Commit.

---

### Task 12: the tour authors its pole

**Files:**

- Modify: `src/data/animation/tours/grandTour/openingTitle.ts`, `src/data/animation/tours/grandTour/approachM31.ts`, `src/data/animation/tours/grandTour/homeAgain.ts`
- Test: `tests/data/animation/clips/clipRegistry.test.ts` (unchanged — no new clip ids)

`frameTo` goes in the clip, never on the beat. Assignment: `galactic` for the opening (holds through you-are-here), `supergalactic` from the M31 approach outward, `galactic` again for home-again. Roll duration is the visual knob; start from the existing `FRAME_TWEEN_MS` feel and expect to tune it against the user's pass.

- [x] Add `frameTo('galactic', { over })` to the opening beat's clip, before the pose snap.
- [x] Add `frameTo('supergalactic', { over })` to the M31-approach clip; add `frameTo('galactic', { over })` to home-again.
- [x] Add an entry to `docs/tour/implementation-notes.md`: the tour owns its pole, why (dwell roll fraction), and where the ladder is declared.
- [x] `npm run typecheck && npm test` → GREEN.
- [x] Commit.

---

## Definition of Done

**Deliverable inventory**

- `src/utils/camera/reencodePose.ts` + test.
- `OrbitCamera.poseBasis` and `OrbitCamera.upBasis`; no `frameBasis` field remains on the camera.
- `spinToId` in `effectHelpers.ts` with a resolver arm in `resolveClipFoci.ts`.
- `CameraState['clip']` and `CameraTweenDescriptor` each carry an `OrientationFrameId`.
- `SceneSnapshot` carries `orientation` (NOT `SettingsSnapshot` — the per-beat merge would revert an authored pole), and restore dispatches `requestOrientationChange`.
- Zero frame-local bearing constants under `src/data/animation/tours/` or in `cameraFraming.ts`.
- `frameTo` cues in the opening, M31-approach, and home-again clips.
- A `docs/tour/implementation-notes.md` entry for the frame ladder.

**Named observable behaviours** (manual pass, real data, dev server)

- Switching orientation in Settings while looking at a galaxy: the galaxy stays centred and the same size, the horizon rolls beneath it. No sweep, no zoom, no drift.
- Switching orientation mid-tour-beat: same, with the beat's motion continuing through the roll.
- Grand tour beats 00, 01, 10 read with the Milky Way disc horizontal; beats 02–09 with the supergalactic plane horizontal.
- Tour dwells read as horizontal orbits, not rolls.
- The neighbourhood flythrough starts without a positional pop and settles framed on Cen A.
- After the tour ends, Settings shows the frame the viewer had before it started.
- A hand drag and a wheel zoom behave identically to before at rest, in every frame.

**Deferral boundary**

- No clip-local orbit axis — a clip still orbits about the frame pole. That is the follow-up question, recorded in the spec's Open items.
- No tour extension: the solar-system and stellar acts are separate work.
- `sampleClipPath` is debug-inspector only; its fix is correctness housekeeping, not a user-visible deliverable.
- `cam.roll` stays dormant.
