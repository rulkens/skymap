# Orientation frame switch — feature PR

REQUIRED SUB-SKILL: superpowers:subagent-driven-development

> The **feature PR** for the switchable-orientation-frame work
> (`docs/superpowers/specs/2026-07-22-orientation-frame-switch.md`). It lands
> **after** both prep PRs are merged, and is written against the post-prep
> architecture:
>
> - **Prep 1** (camera-math consolidation) has shipped `yawPitchToDir(yaw, pitch): Vec3`
>   (the local-frame Y-up spherical decode) and a shared roll-aware camera-up
>   helper, and has already rerouted `updatePosition` / `computeViewProj` /
>   `cameraBillboardBasis` / `orbitControls` pan / `slabs` / `buildPathTrack` /
>   `horizonShellRenderer` / `resolveClipFoci`'s `strafeId` onto them.
> - **Prep 2** (`docs/superpowers/plans/2026-07-22-orientation-prep2-frame-registry.md`)
>   has shipped `OrientationFrameId` (`src/@types/camera/OrientationFrameId.d.ts`)
>   and `src/data/orientation/orientationFrames.ts` exporting
>   `ORIENTATION_FRAMES: Record<OrientationFrameId, Mat3>` and
>   `ORIENTATION_FRAME_QUATERNIONS: Record<OrientationFrameId, Vec4>` (middle
>   column of each `Mat3` = the frame's pole; quaternions derived via
>   `matrixToQuaternion`).
>
> **CONFIRM the exact Prep 1 helper name** against the merged Prep 1 plan before
> Task 7 — this plan refers to it as *the shared camera-up helper*; if Prep 1
> named it differently, use that name.
>
> Spec §3.2–§8 and §10–§11 are this plan's scope. The spec is the contract; do
> not re-litigate its ratified decisions (Q1–Q8).

## Goal

Add a user-facing **Orientation** switch with four frames (ecliptic default,
equatorial, galactic, supergalactic), each meaning "that frame's north pole is
up". Switching animates a ~1 s roll that holds the subject; a `frameTo` clip cue
authors the same reorientation inside a tour; the non-default choice persists to
a share URL. Camera-side only — no data rebake, shader, picking, or engine-logic
change (spec §7).

## Architecture

Four moving parts, each an additive growth of an existing seam (spec §3–§8):

1. **Settings** hold the committed frame (`orientation: OrientationFrameId`,
   default ecliptic). Snapping the setting is orthogonal to animating it.
2. **The camera slice** holds a transient `frameTween` (the in-flight slerp
   descriptor), resolved per frame like `tween` / `clip`.
3. **`resolveFrameBasis`** produces the resolved basis `B(t)` once per frame:
   the steady `ORIENTATION_FRAMES[orientation]` when `frameTween` is null, else
   the slerp of the two frame quaternions. `B(t)` rides on the `OrbitCamera` as
   an optional `frameBasis` field; the yaw/pitch **decode** (`updatePosition`),
   **encode** (`orbitAnglesLookingAlong`), and **camera-up** (the shared helper)
   read it. Position and target stay world-equatorial, so the only world-space
   delta a switch produces is the up-vector rotating old-pole → new-pole — a
   pure roll (Q4).
4. **`frameTo`** is a cue-style scene effect that fires `startFrameTween` +
   `setOrientation`; the **URL** `orientation` source persists a non-default
   frame and snaps it (no slerp) on boot, before the camera seeds.

**Live-basis capture (the slerp `fromQuat`).** A switch always composes over
whatever the basis is *right now* — steady or mid-slerp — so rapid dropdown
switching re-animates continuously with no snap-back to the committed pole (Q6
"always composes, stays continuous"). The `fromQuat` is therefore captured from
the **live resolved `B(t)`**, not the committed frame's steady quaternion. Two
symmetric surfaces read the same live capture:

- **Interactive switch** — the UI dispatches a reducer-less
  `requestOrientationChange(frame)` intent (the `startClip`/`stopClip` idiom in
  `clipActions.ts`). A `takeLatest` saga reads the live basis quaternion off the
  `cameraRuntime` saga-context resource (the exact mechanism
  `watchFocusTweenSaga` uses to read the live from-pose,
  `watchFocusTweenSaga.ts:64,105-111`), then dispatches `setOrientation(frame)` +
  `startFrameTween({ fromQuat: liveQuat, … })`.
- **`frameTo` cue** — fires engine-side in `applySceneEffect`, where the resource
  is at hand: it reads the same live basis directly off `EngineState` and
  dispatches the same two actions.

The engine's per-frame produce path stashes the resolved `B(t)` on
`cameraRuntime` so both surfaces read one authoritative live value. The URL/boot
read dispatches `setOrientation` **alone** (a snap); the saga watches
`requestOrientationChange`, **not** `setOrientation`, so boot can never
accidentally slerp.

`frameBasis` is **optional** on `OrbitCamera`, treated as identity (no swizzle)
when absent — so every non-engine `OrbitCamera` builder (synthetic dev tools,
tests) is unchanged, and only the engine produce path opts in. The **decode**
in the render path reads the mid-slerp `B(t)`; the **encode** at clip
resolve/build time reads the *steady* `ORIENTATION_FRAMES[orientation]` (authored
bearings are relative to the committed frame, resolved at a frame boundary).

Quaternion slerp + basis conversion reuse **wgpu-matrix** (`quat.slerp`,
`mat3.fromQuat`) — the same library `computeViewProj` imports; do not write a new
slerp. Per-frame endpoint quaternions come from Prep 2's
`ORIENTATION_FRAME_QUATERNIONS`.

## Tech Stack

TypeScript, RTK (Immer case reducers), Vitest, React (SettingsPanel container +
presentational split). wgpu-matrix for `quat` / `mat3`. No WGSL, no `.bin`, no
GPU-pipeline edits.

## Global Constraints

- **Suite green:** `npm test` passes at every commit; `npm run typecheck` clean
  (both src + tools tsconfigs).
- **House rules:** `type` aliases never `interface`; **one symbol per file** in
  `src/@types/` and `src/utils/`; RTK draft arg named `settings` / `camera`,
  payload `action` (never `s`/`a`); didactic module headers that explain *why*
  and the alternative; comments timeless (no "moved from" / history notes).
- **UI copy carries no em dashes** and no LLM tells (parenthetical qualifiers
  only — see the exact label strings in Task 14).
- **Format only touched files** (`npx prettier --write <paths>`); never repo-wide.
- **Stage specific paths** — never `git add -A` / `git add .`.
- **Commit trailer** (repo's exact form, verified via `git log -3 --format='%b'`):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

  Use the user's git identity; never `--author`.
- One commit per task (or per coherent pair); branch + PR, never direct-push
  `main`. **Draft the PR when the first task lands.**
- No task in this plan moves or renames a TS file, so no `npm run refactor -- move`
  invocation is required. (If a task grows one, spell the command out.)

---

## Task 1: Settings — `orientation` field, default, reducer, selector

**Files:** `src/data/defaults.ts` (modify), `src/state/settings/initialState.ts`
(modify), `src/state/settings/settingsSlice.ts` (modify),
`src/state/settings/selectors.ts` (modify),
`src/@types/settings/EngineSettingsState` (add the field to the settings shape),
`tests/state/settings/settingsSlice.test.ts` (modify, if a reducer test file exists).

The persisted choice is a **bare scalar** view preference (spec §3.2), unlike the
multi-field clusters. Follow the `ToneMapCurve` enum-setting recipe, but note
`OrientationFrameId` is a **string** union — no `parseInt` anywhere.

**Contract:**

```ts
// src/data/defaults.ts
export const DEFAULT_ORIENTATION: OrientationFrameId = 'ecliptic';

// src/state/settings/initialState.ts — buildInitialSettings() top-level field
orientation: DEFAULT_ORIENTATION,

// src/state/settings/settingsSlice.ts
setOrientation: (settings, action: PayloadAction<OrientationFrameId>) => {
  settings.orientation = action.payload;
},

// src/state/settings/selectors.ts
export const selectOrientation = (state: RootState): OrientationFrameId =>
  selectSettings(state).orientation;
```

- [x] Add `DEFAULT_ORIENTATION` to `data/defaults.ts` with a didactic comment:
      ecliptic default because Earth's 23.44° obliquity is *desired* in the
      solar-system view (spec Goals). Import `OrientationFrameId` as a type.
- [x] Add the `orientation` field to `EngineSettingsState` (top-level, not inside
      a cluster) and seed it in `buildInitialSettings()` from `DEFAULT_ORIENTATION`
      (mirror how `tonemap.curve` seeds from `DEFAULT_TONE_MAP_CURVE`).
- [x] Add `setOrientation` to the slice reducers **and** to the exported action
      creators list (`settingsSlice.ts:419-485`).
- [x] Add `selectOrientation` to `selectors.ts`.
- [x] No constant-restatement test (`testing.md` — a `DEFAULT_SETTINGS` toEqual is
      a change-detector). If a slice-behaviour test file exists, add one case:
      `it('setOrientation writes the frame')` — dispatch `setOrientation('galactic')`,
      assert `selectOrientation` returns `'galactic'`. Otherwise omit.
- [x] `npm run typecheck` clean; `npm test -- settings` green. Commit.

---

## Task 2: `FrameTween` type + camera-slice `frameTween`

**Files:** `src/@types/camera/FrameTween.d.ts` (new — one type per file),
`src/@types/camera/CameraState` (add the field),
`src/state/camera/cameraSlice.ts` (modify),
`src/state/camera/selectors.ts` (modify).

The slerp is a transient camera value resolved per frame — never a fifth driver
row (spec §3.3). `setOrientation` snaps the committed target; `startFrameTween`
starts the animation. They are orthogonal so a URL-boot apply and a tour cue can
set the frame without an animation they don't want.

**Contract:**

```ts
// src/@types/camera/FrameTween.d.ts
export type FrameTween = {
  readonly fromQuat: Vec4;          // basis quaternion captured at switch start
  readonly to: OrientationFrameId;  // destination frame (its quaternion is the slerp end)
  readonly durationMs: number;
  readonly easing: Ease;
};

// cameraSlice.ts — initialState gains:  frameTween: null
startFrameTween: (camera, action: PayloadAction<FrameTween>) => {
  camera.frameTween = action.payload;
},
clearFrameTween: (camera) => {
  camera.frameTween = null;
},
```

- [x] Create `FrameTween.d.ts` with a didactic header (transient roll descriptor;
      `fromQuat` is wall-clock-free like `CameraTweenDescriptor`, so it survives
      serialise/replay). Import `Vec4`, `OrientationFrameId`, `Ease`.
- [x] Add `frameTween: FrameTween | null` to `CameraState`, seeded `null` in the
      slice `initialState` (`cameraSlice.ts:56-68`). Update the slice module
      header's "concerns" list to name it (mirror the `tween` / `clip` prose).
- [x] Add `startFrameTween` / `clearFrameTween` reducers + export them
      (`cameraSlice.ts:131-140`).
- [x] Extend `selectCameraActive` (`state/camera/selectors.ts:48-51`) with
      `|| c.frameTween !== null` so the render loop keeps ticking through the
      slerp — this is the one definition `shouldKeepTicking` ORs, so no separate
      wake term is added to `shouldKeepTicking.ts`.
- [x] Test: `it('selectCameraActive is true while a frameTween is in flight')` —
      state with only `frameTween` non-null (base at rest, no tween/clip/drag/
      autoRotate) → `true`; with `frameTween: null` and all else at rest → `false`.
      (Behavioural: catches a dropped OR term that would freeze the roll mid-slerp.)
- [x] `npm run typecheck` clean; `npm test -- camera` green. Commit.

---

## Task 3: `cameraClock.frameTweenElapsed` accessor

**Files:** `src/services/engine/camera/cameraClock.ts` (modify),
`src/@types/engine/camera/CameraClock` (add the two fields),
`tests/services/engine/camera/cameraClock.test.ts` (modify).

Mirror the `tweenElapsed` identity-reset idiom (`cameraClock.ts:68-78`): reset the
start on `frameTween` reference identity, return ms elapsed. The caller owns the
wall clock (`nowMs` param) — never read `performance.now()` here.

**Contract:**

```ts
export function frameTweenElapsed(
  clock: CameraClock,
  frameTween: FrameTween | null,
  nowMs: number,
): number;
//   new frameTween ref → reset start to nowMs (null → null start); returns 0 on
//   the arrival frame, grows on later same-ref frames; null always 0.
```

- [x] Add `frameTweenStartMs: number | null` and `lastFrameTweenRef: FrameTween | null`
      to `CameraClock`, initialised in `createCameraClock` (`cameraClock.ts:38-54`).
- [x] Implement `frameTweenElapsed` exactly parallel to `tweenElapsed`.
- [x] Test: `it('frameTweenElapsed resets on descriptor identity change')` —
      first call with a fresh descriptor at `nowMs=1000` returns `0`; same ref at
      `1250` returns `250`; a **new** descriptor object at `1400` returns `0`
      again; `null` returns `0`. (Identity-reset behaviour; not a mirror.)
- [x] `npm run typecheck` clean; `npm test -- cameraClock` green. Commit.

---

## Task 4: `resolveFrameBasis` — the resolved basis `B(t)`

**Files:** `src/services/engine/camera/resolveFrameBasis.ts` (new),
`tests/services/engine/camera/resolveFrameBasis.test.ts` (new).

One pure resolver called once per frame (spec §3.4). Slerp + basis conversion via
wgpu-matrix (`quat`, `mat3`) — **search-before-writing:** `quat.slerp(a, b, t)`
and `mat3.fromQuat(q)` already exist (same import style as `computeViewProj`'s
`mat4`). The steady endpoints are Prep 2's `ORIENTATION_FRAME_QUATERNIONS`.

**Contract:**

```ts
export function resolveFrameBasis(
  orientation: OrientationFrameId,
  frameTween: FrameTween | null,
  clock: CameraClock,
  nowMs: number,
): Mat3;
//   frameTween === null → ORIENTATION_FRAMES[orientation]                       (steady)
//   else                → mat3.fromQuat(quat.slerp(
//                            frameTween.fromQuat,
//                            ORIENTATION_FRAME_QUATERNIONS[frameTween.to],
//                            ease(frameTweenElapsed(clock, frameTween, nowMs) / durationMs)))
```

`ease` is the runtime easing table `EASE` (`services/engine/animation/ease.ts`)
keyed by `frameTween.easing`. Clamp the eased `t` to `[0,1]` so an over-elapsed
call returns the endpoint (the produce path clears the tween, but the resolver
must be total).

- [x] Write the tests first (TDD):
  - [x] `it('at elapsed 0 the basis equals the fromQuat basis')` — a `frameTween`
        with `fromQuat = ORIENTATION_FRAME_QUATERNIONS.equatorial`, `to:'galactic'`;
        with the clock arranged so elapsed is 0, `resolveFrameBasis` ≈
        `ORIENTATION_FRAMES.equatorial` (per-cell, ~1e-6).
  - [x] `it('at elapsed ≥ durationMs the basis equals the destination frame')` —
        same descriptor, clock elapsed ≥ `durationMs` → ≈ `ORIENTATION_FRAMES.galactic`.
  - [x] `it('every sampled midpoint basis is orthonormal')` — sample eased `t` at
        several interior fractions; each resolved `Mat3` has unit-length,
        mutually-orthogonal columns (~1e-6). (Slerp keeps midpoints orthonormal;
        this fails if the conversion drops normalisation.)
  - [x] `it('a null frameTween returns the steady registry basis')` — ≈
        `ORIENTATION_FRAMES[orientation]` for one non-default frame.
- [x] Implement to pass. Note the `'linear'` easing arm for a maths-clean midpoint
      assertion.
- [x] `npm run typecheck` clean; `npm test -- resolveFrameBasis` green. Commit.

---

## Task 5: `OrbitCamera.frameBasis` + frame-aware **decode**

**Files:** `src/@types/camera/OrbitCameraInit.d.ts` (add optional field),
`src/utils/camera/updatePosition.ts` (modify),
`tests/utils/camera/updatePosition.test.ts` (modify).

`OrbitCamera` gains an optional `frameBasis` (spec §3.4). The decode maps the
frame-local direction into world through it: `dir_world = frameBasis · yawPitchToDir(yaw, pitch)`.
Absent `frameBasis` ⇒ identity (the pre-feature behaviour), so every non-engine
caller is untouched — mirrors how `roll?` is optional.

**Contract:**

```ts
// OrbitCameraInit.d.ts — new optional field (didactic: frame-local → world basis;
//   absent = identity so synthetic/dev-tool cameras are unchanged; middle column
//   is the frame pole, per ORIENTATION_FRAMES)
readonly frameBasis?: Mat3;
```

`updatePosition` (`updatePosition.ts:42-55`) composes the basis over
`yawPitchToDir` (the Prep 1 decode) when `cam.frameBasis` is present, else uses
`yawPitchToDir` directly. Use `vec3.transformMat3` (wgpu-matrix) for the
`frameBasis · dir` product, then `vec3.addScaled(target, dir_world, distance, position)`.

- [x] Add the optional field to `OrbitCameraInit` with the didactic note.
- [x] Reroute `updatePosition` through `frameBasis` when present; keep the
      no-basis path identical to Prep 1's `yawPitchToDir` decode.
- [x] Test: `it('a non-identity frameBasis rotates the derived position into the frame')`
      — with `frameBasis = ORIENTATION_FRAMES.equatorial` (pole = world +z), a
      pose at `yaw=0, pitch=π/2` (local pole) puts `position` at
      `target + distance·(+z)` (hand-computed: the equatorial pole is world +z),
      NOT `+y`. (Proves the basis is applied and which column is the pole.)
- [x] `npm run typecheck` clean; `npm test -- updatePosition` green. Commit.

---

## Task 6: Frame-aware **encode** + the round-trip invariant

**Files:** `src/utils/camera/orbitAnglesLookingAlong.ts` (modify),
`src/services/engine/animation/resolveClipFoci.ts` (modify),
`src/services/engine/animation/buildPathTrack.ts` (modify),
`tests/utils/camera/orbitAnglesLookingAlong.test.ts` (modify).

Encode inverts decode through the *same* basis, which is what makes derived poses
(path tangents, foci framing) world-invariant (spec §3.4 / Q5):
`dir_frame = frameBasisᵀ · (−forward)`, then `pitch = asin(dir_frame.y)`,
`yaw = atan2(dir_frame.x, dir_frame.z)`.

**Contract:**

```ts
export function orbitAnglesLookingAlong(
  forward: Vec3,
  frameBasis?: Mat3,   // absent = identity (the four pre-feature call sites)
): { yaw: number; pitch: number };
```

- [x] Add the optional `frameBasis` param. When present, transform `−forward` by
      `frameBasisᵀ` before extracting the angles (transpose a column-major `Mat3`,
      or `vec3.transformMat3` with the transposed basis — either is fine; the
      encode consumers pass the **steady** basis, so precompute the transpose once
      at the call context). Absent ⇒ current behaviour exactly.
- [x] Thread the active-frame **steady** basis into the two runtime encode call
      sites so encode/decode share it:
  - [x] `resolveClipFoci.ts:144` (`lookAtId` → `aimAt(orbitAnglesLookingAlong(forward))`).
  - [x] `buildPathTrack.ts:333` and `:578` (path-tangent aim channels).
      Both resolve at clip start, so read `ORIENTATION_FRAMES[state.settings.orientation]`
      (steady) at that context. **Confirm** how each already receives store/engine
      state; if the basis is not currently in scope there, thread it from the clip
      resolve entry point (do not read the store deep inside `buildPathTrack`).
- [x] Round-trip test (spec §10, the load-bearing invariant):
      `it('encode ∘ decode recovers yaw/pitch under each frame basis')` — for each
      of the four `ORIENTATION_FRAMES` and a spread of non-pole `(yaw, pitch)`
      away from the poles: build `dir_world` via the Task-5 decode
      (`frameBasis · yawPitchToDir`), form `forward = −dir_world`, feed
      `orbitAnglesLookingAlong(forward, frameBasis)`, assert the recovered
      `(yaw, pitch)` matches the input (~1e-6, normalising yaw to `(−π, π]`). Fails
      on any encode/decode basis mismatch.
- [x] `npm run typecheck` clean; `npm test -- orbitAnglesLookingAlong resolveClipFoci buildPathTrack`
      green. Commit.

---

## Task 7: Frame-aware **camera-up**

**Files:** the shared camera-up helper from Prep 1 (modify — **confirm its path +
name** against the merged Prep 1 plan), plus its test.

The camera-up is the middle column of the basis: `frameUp = frameBasis · [0,1,0]`
(spec §3.4). The Prep 1 helper already produces a roll-aware up from a base
up-vector; the feature feeds it `frameUp` instead of the hardcoded `[0,1,0]`. The
helper reads `cam.frameBasis` (present on the engine's produced `OrbitCamera`),
composing the frame up with the existing `roll` Rodrigues rotation — so the
switch's roll and an authored `roll` compose, and every up consumer Prep 1
rerouted (`computeViewProj` lookAt-up, `cameraBillboardBasis`, `orbitControls`
pan, `slabs`, `buildPathTrack`, `horizonShellRenderer`) becomes frame-aware in
one place.

- [x] In the shared helper: when `cam.frameBasis` is present, use
      `frameBasis · [0,1,0]` (the middle column — `mat3` column 1, indices 3,4,5)
      as the base up before applying the roll rotation; absent ⇒ `[0,1,0]`
      (unchanged). No consumer edits — they already call the helper.
      *(Landed as `frameUp()` util + upRef swaps at the seven call sites — the
      helper's upRef parameter is the seam Prep 1 built; same semantics.)*
- [x] Test: `it('the camera up follows the frame pole')` — a camera with
      `frameBasis = ORIENTATION_FRAMES.equatorial` and `roll = 0` yields an up ≈
      world `+z` (the equatorial pole), not `+y`; with no `frameBasis` yields `+y`.
      (Proves frame-up is fed and roll composes over it.)
- [x] `npm run typecheck` clean; run the helper's test file green. Commit.

---

## Task 8: `assembleOrbitCamera` wiring + drag-register basis

**Files:** `src/services/engine/camera/assembleOrbitCamera.ts` (modify),
`src/services/engine/frame/frameContext.ts` (modify),
`src/services/engine/wiring/buildDemandCtx.ts` (modify),
`tests/services/engine/camera/assembleOrbitCamera.test.ts` (modify).

Every engine site that assembles an `OrbitCamera` and derives its position now
threads the resolved basis, so demand-time and draw-time positions never diverge.

**Contract:**

```ts
export function assembleOrbitCamera(
  pose: CameraPose,
  projection: CameraProjection,
  frameBasis: Mat3,
): OrbitCamera;   // writes frameBasis onto the returned camera before updatePosition
```

- [x] Add the `frameBasis` parameter to `assembleOrbitCamera`; set
      `cam.frameBasis = frameBasis` **before** the `updatePosition(cam)` call
      (`assembleOrbitCamera.ts:28-45`) so the derived `position` decodes through it.
- [x] `frameContext.ts:152` — `deriveFrameContext` gains a `frameBasis: Mat3`
      parameter (threaded from `runFrame`, Task 9) and forwards it to
      `assembleOrbitCamera(pose, projection, frameBasis)`. `computeViewProj` and
      `deriveSlabs` then see the frame-aware `cam` for free.
- [x] `buildDemandCtx.ts:50` — the `cameraPosMpc` read must pass the **same**
      basis the frame used (its comment at `:44-47` already pins the byte-identical
      requirement). Thread the resolved basis (or, if `buildDemandCtx` runs off the
      frame path, resolve the steady `ORIENTATION_FRAMES[state.settings.orientation]`
      there — a demand read between frames is at rest, so steady is correct).
- [x] The **drag register** (`state.cam`): `runFrame` writes the resolved basis
      onto it each frame (Task 9) so `orbitControls` / `seedCameraFromBase`'s
      `updatePosition(cam)` (`seedCameraFromBase.ts:48`, `orbitControls.ts:356/433/466`)
      decode through the live `B(t)` during a drag. No edit to those files (Prep 1
      already routed their up/pan through the shared helper); the field is simply
      present. Verify `state.cam` is constructed with (or tolerates) `frameBasis`.
- [x] Update the `assembleOrbitCamera` test to pass a basis and assert the
      returned camera carries it and its `position` reflects it (reuse the Task-5
      hand-computed pole case).
- [x] `npm run typecheck` clean; `npm test -- assembleOrbitCamera` green. Commit.

---

## Task 9: Engine produce path — resolve `B(t)` once, clear on completion

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`src/@types/engine/state/CameraRuntime.d.ts` (add the boxed basis Resource),
`src/services/engine/engine.ts` (seed the Resource at construction),
`tests/services/engine/frame/*` (add a focused frame test).

`resolveFrameBasis` runs exactly once per frame in the produce path (spec §3.4),
next to `runCameraDrivers` (`runFrame.ts:238`), and the tween is cleared once
elapsed ≥ `durationMs` (mirroring the tween-completion block at `runFrame.ts:260-268`).

**Contract (new Resource — the single live-basis host both switch surfaces read):**

```ts
// src/@types/engine/state/CameraRuntime.d.ts — new boxed field (mirrors lastPose)
readonly frameBasis: { current: Mat3 };   // this frame's resolved B(t); single writer = runFrame
```

- [x] Add `frameBasis: { current: Mat3 }` to `CameraRuntime` (boxed, like
      `lastPose` / `prevActiveId`). Seed it at engine construction with
      `ORIENTATION_FRAMES[DEFAULT_ORIENTATION]` so a pre-first-frame read is valid.
- [x] After the pose is produced (`runFrame.ts:238-244`), call
      `resolveFrameBasis(rootState.settings.orientation, rootState.camera.frameTween,
      state.cameraRuntime.clock, nowMs)` **once**, capturing `B(t)`. The clock is
      already advanced once per frame here — `frameTweenElapsed` resets on identity
      like `tweenElapsed`, so calling it inside `resolveFrameBasis` is the single
      per-frame tick.
- [x] Write `B(t)` to **both** live-basis readers:
      `state.cameraRuntime.frameBasis.current = B` (the host the saga context +
      `applySceneEffect` read for the switch `fromQuat`) and the drag register
      `state.cam.frameBasis = B` (so a grab this frame decodes correctly).
- [x] Pass `B(t)` into `deriveFrameContext` (Task 8 added the parameter) at the
      `runFrame.ts:382` call.
- [x] Clear-on-completion: when `rootState.camera.frameTween !== null` and
      `frameTweenElapsed(...) >= frameTween.durationMs`, dispatch `clearFrameTween()`
      (idempotent same-frame `frameTweenElapsed` re-call is safe — the ref is
      unchanged, no clock double-tick, exactly as the tween-completion block notes).
- [x] **Hold-pose invariance test** (spec §10, the Q4 guarantee):
      `it('an idle frame switch rotates the up-vector without moving eye or target')`
      — with the resting driver winning (base at rest) and a `frameTween` in
      flight, produce the frame at several elapsed instants; assert `cam.target`
      and `cam.position` are constant across the transition (~1e-6) while the
      lookAt up-vector rotates. Proves the roll does not translate the eye.
- [x] **`PITCH_LIMIT` edge test** (spec §10): `it('a switch into a near-pole-aligned
      view resolves to a finite pose at the clamp, not NaN')` — arrange a view
      direction nearly parallel to the destination frame's pole; produce through
      the slerp; assert every `cam.position` / `cam.yaw` / `cam.pitch` is finite
      (`Number.isFinite`) and pitch sits at the existing `PITCH_LIMIT`
      (`orbitControls.ts:91`), not NaN. (The clamp already handles it; this pins it.)
- [x] `npm run typecheck` clean; `npm test -- runFrame` (and the new test) green. Commit.

---

## Task 10: `requestOrientationChange` intent + saga (live-basis capture)

**Files:** `src/state/camera/orientationActions.ts` (new — the request action),
`src/state/camera/watchOrientationChangeSaga.ts` (new — the saga),
`src/store/types.ts` (extend the `cameraRuntime` context accessor's shape),
`src/services/engine/engine.ts` (fill the new accessor field),
`src/store/rootSaga.ts` (register the saga),
`tests/state/camera/watchOrientationChangeSaga.test.ts` (new).

The interactive switch is a two-effect intent (persist the frame + animate the
roll) that needs the **live** basis quaternion — captured off the frame-loop
resource so a re-switch mid-slerp composes continuously instead of snapping the
up-vector back to the committed pole (Q6). This mirrors `watchFocusTweenSaga`
(`watchFocusTweenSaga.ts`): a `takeLatest` saga reads the live camera resource
from saga context, builds the payload, and dispatches — the UI never touches the
camera slice directly.

**Contract:**

```ts
// src/state/camera/orientationActions.ts  (reducer-less request, clipActions.ts idiom)
export const requestOrientationChange =
  createAction('orientation/request', (frame: OrientationFrameId) => ({ payload: frame }));

// src/store/types.ts — the runtime snapshot (:63) gains the live basis quaternion
// AND sheds its focus-only name: it now serves both the focus and orientation
// sagas, so rename FocusCameraRuntime → LiveCameraRuntime (names track what a
// type serves). Rename via `npm run refactor -- rename` so every reference moves.
export type LiveCameraRuntime = { from: CameraPose; fovYRad: number; frameBasisQuat: Vec4 };

// src/services/engine/engine.ts — the cameraRuntime() accessor (:656-662) fills it:
//   frameBasisQuat: matrixToQuaternion(state.cameraRuntime.frameBasis.current)

// src/state/camera/watchOrientationChangeSaga.ts
export function* watchOrientationChangeSaga(): Generator; // takeLatest(requestOrientationChange, …)
```

The saga worker (read `cameraRuntime` via `getContext` **inside** the worker, as
`watchFocusTweenSaga.ts:64` does — the engine registers the context after the
root saga forks):

- reads `runtime = cameraRuntime()`;
- if `runtime === null` (pre-bootstrap / post-destroy) → `put(setOrientation(frame))`
  **alone** (nothing to animate — a snap, matching the focus saga's null-runtime bail);
- else → `put(setOrientation(frame))` then
  `put(startFrameTween({ fromQuat: runtime.frameBasisQuat, to: frame,
  durationMs: FRAME_TWEEN_MS, easing: 'inOut' }))`. `FRAME_TWEEN_MS = 1000`
  (~1 s, spec §8) — a named const co-located with the saga.

`takeLatest` is the idiom (a newer switch supersedes a waiting worker); no raw
`while (true)` watcher loop is needed, so the `while (true)` saga convention does
not apply here. RTK arg names throughout.

- [x] Create `orientationActions.ts` (didactic header: reducer-less; the saga owns
      the live-basis capture, mirroring `clipActions.ts`).
- [x] Rename `FocusCameraRuntime` → `LiveCameraRuntime`
      (`npm run refactor -- rename` — it now serves the focus AND orientation
      sagas, so the focus-scoped name would lie), extend it with
      `frameBasisQuat: Vec4`, and fill that in the `cameraRuntime()` accessor
      (`engine.ts:656-662`) via
      `matrixToQuaternion(state.cameraRuntime.frameBasis.current)`. Update the
      accessor's doc comment to name the new field; the focus saga ignores it.
- [x] Create `watchOrientationChangeSaga.ts` per the contract; register it in
      `rootSaga.ts` (`:68` `all([...])`, next to `watchFocusTweenSaga()`), and add
      its one-line description to the root-saga header list (`rootSaga.ts:15`-style).
- [x] Tests (`tests/state/camera/watchOrientationChangeSaga.test.ts`) — use
      `redux-saga`'s test runner / a mock `cameraRuntime` context:
  - [x] `it('requestOrientationChange dispatches setOrientation then startFrameTween to the target')`
        — with a non-null `cameraRuntime`, dispatching `requestOrientationChange('galactic')`
        yields `put(setOrientation('galactic'))` and a `put(startFrameTween(...))`
        whose `to === 'galactic'`, `durationMs === FRAME_TWEEN_MS`, `easing === 'inOut'`.
  - [x] `it('requestOrientationChange mid-slerp captures the live basis, not the committed frame')`
        — the mock `cameraRuntime().frameBasisQuat` returns a quaternion distinct
        from every `ORIENTATION_FRAME_QUATERNIONS` entry (a synthetic mid-slerp
        value); assert the dispatched `startFrameTween.fromQuat` equals **that live
        quat**, not `ORIENTATION_FRAME_QUATERNIONS[committedFrame]`. (This is the
        regression guard for the rejected committed-frame capture — the jank the
        amendment fixes.)
  - [x] `it('a null cameraRuntime snaps via setOrientation with no frameTween')` —
        with `cameraRuntime()` null, only `setOrientation` is put; no `startFrameTween`.
- [x] `npm run typecheck` clean; `npm test -- watchOrientationChangeSaga` green. Commit.

---

## Task 11: `frameTo` clip cue

**Files:** `src/@types/animation/SceneEffect.ts` (add arm),
`src/services/engine/animation/effectHelpers.ts` (add constructor),
`src/services/engine/animation/compileClip.ts` (add cue case),
`src/services/animation/applySceneEffect.ts` (add dispatch),
`tests/services/engine/animation/compileClip.test.ts` (modify),
`tests/services/animation/applySceneEffect.test.ts` (modify).

A cue-style effect like `scene` / `focus` — fires at its beat, dispatches
`startFrameTween` + `setOrientation`, returns **0 awaited duration** (spec §4). An
author who wants a beat to dwell through the reorientation sequences a `wait(over)`
after it.

**Anchor correction vs the spec's §4 code comment.** The spec sketches the new arm
on `Effect.d.ts`, but the cue plumbing is typed through `SceneCue.effect: SceneEffect`
(`CompiledClip.d.ts:204`) and `applySceneEffect(effect: SceneEffect)`. Add the arm
to **`SceneEffect.ts`** (the canonical cue union, home of `scene`/`focus`); `Effect`
inherits it because `Effect = CameraAction | SceneEffect | …`. This is the shape
that makes `compileClip`'s `acc.cues.push({ atSec, effect })` and `applySceneEffect`
typecheck without widening `SceneCue`.

**Contract:**

```ts
// src/@types/animation/SceneEffect.ts — new arm
| { readonly kind: 'frameTo'; readonly frame: OrientationFrameId; readonly over: number; readonly ease: Ease }

// src/services/engine/animation/effectHelpers.ts
export function frameTo(
  frame: OrientationFrameId,
  opts: { over: number; ease?: Ease },
): SceneEffect & { kind: 'frameTo' };   // ease defaults to 'inOut'
```

- [x] Add the `frameTo` arm to `SceneEffect` with a didactic note (cue-style
      reorientation; fires `startFrameTween` + `setOrientation`).
- [x] Add the `frameTo` constructor to `effectHelpers.ts` (scene-effect helpers
      section, near `scene` / `focus`), defaulting `ease` to `'inOut'`.
- [x] `compileClip.ts` — add `case 'frameTo':` to the cue-accumulator arm
      (`compileClip.ts:255-262`, alongside `show`/`hide`/`fade`/`scene`/`focus`):
      push `{ atSec, effect }`, return `0`. The exhaustive `never` guard
      (`:276-279`) forces this; no other compile change.
- [x] `applySceneEffect.ts` — add `case 'frameTo':` (`applySceneEffect.ts:63-129`).
      At fire time, capture the **live** basis (symmetric with the interactive
      saga, Task 10): `const fromQuat = matrixToQuaternion(state.cameraRuntime.frameBasis.current)`
      (`state` is `deps.state: EngineState`, so the resource is at hand). Dispatch
      `store.dispatch(setOrientation(effect.frame))` **then**
      `store.dispatch(startFrameTween({ fromQuat, to: effect.frame,
      durationMs: effect.over * 1000, easing: effect.ease }))` so the frame persists
      past the clip and the roll composes over the current `B(t)` (a `frameTo`
      firing mid-roll continues, never snaps).
- [x] Compile test: `it('compiling a clip with frameTo emits one cue at the beat and 0 awaited duration')`
      — a timeline `[wait(2), frameTo('galactic', { over: 1 })]` compiles to one
      cue at `atSec ≈ 2` with `effect.kind === 'frameTo'`, and `durationSec === 2`
      (the `frameTo` adds no awaited time).
- [x] Fire test: `it('firing a frameTo cue dispatches setOrientation + startFrameTween with the live basis fromQuat')`
      — call `applySceneEffect` with a `frameTo('galactic', { over: 1 })` effect and
      a `deps.state` whose `cameraRuntime.frameBasis.current` is a known `Mat3`;
      assert `setOrientation('galactic')` was dispatched, and `startFrameTween` with
      `to === 'galactic'`, `durationMs === 1000`, `easing` from the cue, and
      `fromQuat` equal to `matrixToQuaternion(that live basis)` — **not** a steady
      `ORIENTATION_FRAME_QUATERNIONS` entry. (Use spy/mock dispatch.)
- [x] `npm run typecheck` clean; `npm test -- compileClip applySceneEffect` green. Commit.

---

## Task 12: URL `orientation` source

**Files:** `src/utils/url/isOrientationFrameId.ts` (new — one-fn file),
`src/hooks/hashParamSources.ts` (modify), `src/hooks/useUrlSync.ts` (modify),
`tests/hooks/hashParamSources.test.ts` (or the URL-sync test home) (modify),
`tests/utils/url/isOrientationFrameId.test.ts` (new).

Third row in `HASH_PARAM_SOURCES` (spec §5), written only when non-default. The
read snaps the committed frame (dispatches `setOrientation`, **not**
`startFrameTween`) so a share link reproduces the composition with no slerp.

**Contract:**

```ts
// src/utils/url/isOrientationFrameId.ts
export function isOrientationFrameId(value: string): value is OrientationFrameId;
//   membership test against the four ids (derive from ORIENTATION_FRAMES keys so
//   it can't drift from the registry — mirror isStructureId's shape,
//   structureIds.ts:31)

// src/hooks/hashParamSources.ts
const orientationSource: HashParamSource = {
  key: 'orientation',
  write: (input) => (input.orientation === 'ecliptic' ? null : input.orientation),
  read: ({ value, dispatch }) => {
    if (value && isOrientationFrameId(value)) dispatch(setOrientation(value));
  },
};
```

- [x] Create `isOrientationFrameId` deriving its accepted set from
      `Object.keys(ORIENTATION_FRAMES)` (registry as the single source of truth).
      Test: `it('accepts the four frame ids and rejects others')` — `'galactic'`
      true, `'ecliptic'` true, `''` false, `'polaris'` false. (Guards the URL read
      against a hand-typed junk value; not a constant restatement — it's a
      classifier over external input.)
- [x] Add `orientation: OrientationFrameId` to `DesiredHashInput`
      (`useUrlSync.ts:68-76`) — **required**, not optional (unlike `time`): every
      caller derives it from the store, and a missing frame has a well-defined
      default. Update `useUrlSync` to read `selectOrientation` and thread it into
      the `computeDesiredHash` input (`useUrlSync.ts:117-119`, `:155-159`).
- [x] Add `orientationSource` to `HASH_PARAM_SOURCES` (`hashParamSources.ts:83`).
      Table order fixes on-URL layout — append it after `focus`, `t` so existing
      deep links are byte-stable.
- [x] Add `orientation` to Effect B's dependency array (`useUrlSync.ts:168`) so an
      interactive switch re-writes the hash.
- [x] Tests (spec §10 URL write-null):
  - [x] `it('writes null at the ecliptic default and the frame id otherwise')` —
        `orientationSource.write` with `orientation:'ecliptic'` → `null`; with
        `'galactic'` → `'galactic'`.
  - [x] `it('a non-default frame round-trips through compose/parse')` —
        `computeDesiredHash` for a galactic input composes a body containing
        `orientation=galactic`; `parseHashParams` recovers it.
  - [x] `it('the read snaps the frame and dispatches no frameTween')` — the source
        `read` with `value:'galactic'` dispatches `setOrientation('galactic')` and
        **not** `startFrameTween` (assert on a spy dispatch).
- [x] `npm run typecheck` clean; `npm test -- hashParamSources useUrlSync isOrientationFrameId`
      green. Commit.

---

## Task 13: Boot ordering — URL frame applies before the camera seeds

**Files:** the mount-order site (verify: `useUrlSync` Effect A mount read vs the
engine bootstrap `computeInitialCamera` → `commitCameraPose`; anchors
`useUrlSync.ts:129-145`, `cameraFraming.ts:48`, `engine.ts` bootstrap,
`state/camera/cameraSlice.ts:85`), plus a boot test if one is reachable.

Spec §5 requires the URL frame to be committed (via `setOrientation`, a snap)
**before** the boot pose is decoded, so the first paint is framed in the URL's
frame with no animation. The read dispatches `setOrientation` (not
`requestOrientationChange`), and the slerp saga (Task 10) watches
`requestOrientationChange` **only** — so a boot `setOrientation` can never start a
`frameTween`. That is the structural guarantee this task pins.

- [x] **Verify the actual mount order**: does `useUrlSync`'s Effect A (which fires
      the `orientation` source `read` → `setOrientation`) run before the engine's
      bootstrap dispatches `commitCameraPose`? Trace the App mount + engine-init
      wiring. Two outcomes:
  - If Effect A already precedes the camera seed: no code change — the produce
    path (Task 9) resolves `B(t)` from the already-committed `orientation`, so the
    boot frame decodes in the URL's frame. Record the ordering as a comment at the
    seed site so a future reorder can't silently regress it.
  - If it does not: make the boot seed read `selectOrientation` at
    `computeInitialCamera` / `commitCameraPose` time (or gate the seed on the URL
    read), so the first produced frame uses the URL frame. Keep the change minimal
    and documented.
- [x] Add a test at whatever layer is reachable in `node` env (the hooks/URL test
      env, not a live engine): `it('the mount read commits the URL frame via setOrientation on isInitial')`
      — the `orientation` source `read({ value:'galactic', isInitial:true })`
      dispatches `setOrientation('galactic')` (the frame must apply on first load,
      unlike `focus`'s clear-suppression). Already partly covered by Task 12's read
      test; keep the `isInitial:true` case explicit here.
- [x] Add the boot-snap guard: `it('a boot setOrientation never starts a frameTween')`
      — run `watchOrientationChangeSaga` and dispatch `setOrientation('galactic')`
      (not `requestOrientationChange`); assert the saga puts **no** `startFrameTween`.
      This pins that the URL/boot snap path can't slerp, because the saga watches
      only the interactive intent.
- [x] If the ordering is only assertable by manual trace (no reachable seam),
      this task is the **documentation** of the constraint with the file anchors
      above and the seed-site comment — not a test. State that outcome explicitly
      in the commit message.
- [x] `npm run typecheck` clean; `npm test` green. Commit.

---

## Task 14: UI — Display "Orientation" row

**Files:** `src/components/SettingsPanel/DisplaySection.tsx` (modify),
`src/components/containers/DisplaySectionContainer.tsx` (modify),
`src/data/orientation/orientationFrameLabel.ts` (new — label fn, one-fn file),
`tests/components/…/DisplaySection*` (modify if a render test exists).

A top-level Display control (spec §8) copying the tone-map curve select
(`DisplaySection.tsx:80-95`), with two differences: `OrientationFrameId` is a
**string** union so `onChange` passes `e.target.value as OrientationFrameId` with
**no `parseInt`**; and the row is a top-level Display control (not inside the
power-user disclosure), so the labels carry their own explanations. Run the
`create-component` skill's conventions before editing the component.

**Option labels — user-facing copy, EXACT strings, no em dashes:**

- `Ecliptic (solar system plane)` *(default)*
- `Equatorial (Polaris up)`
- `Galactic (Milky Way plane)`
- `Supergalactic (supercluster plane)`

**Contract:**

```ts
// src/data/orientation/orientationFrameLabel.ts
export function orientationFrameLabel(frame: OrientationFrameId): string;
//   exhaustive switch returning the four exact strings above; a `never` guard on
//   the closed union (mirrors toneMapCurveLabel, toneMapCurve.ts:58-71)
```

- [x] Create `orientationFrameLabel` (exhaustive switch, exact strings). Iterate
      the options from `Object.keys(ORIENTATION_FRAMES)` (or a small ordered id
      array) so the select can't drift from the registry.
- [x] `DisplaySection.tsx`: add an Orientation `<label>` + `<select>` row (top
      level, above/beside the tone-curve disclosure), driven by new props
      `orientation: OrientationFrameId` + `onOrientationChange: (f: OrientationFrameId) => void`.
      `onChange={(e) => onOrientationChange(e.target.value as OrientationFrameId)}`.
- [x] `DisplaySectionContainer.tsx`: read `selectOrientation` (for the current
      `<select>` value) and dispatch the single intent
      `requestOrientationChange(next)` from the change handler — **nothing else**.
      The saga (Task 10) owns capturing the live basis `fromQuat` and firing
      `setOrientation` + `startFrameTween`, so the container never touches the
      camera slice and never reads a quaternion. The handler closes over `dispatch`
      only (`[dispatch]`), keeping stable identity for the `memo` bail — no `prev`
      capture, no `store.getState()`.
- [x] Test (only if a render test exists for this section): assert the four
      options render and selecting one calls `onOrientationChange` with the id.
      **Do not** test the label strings or option count as constants (`testing.md`
      — spec §10 "Not tested"). Use `fireEvent.change` for the `<select>` (string
      value), and type any mock callback `vi.fn<(f: OrientationFrameId) => void>()`.
- [x] `npm run typecheck` clean; `npm test -- DisplaySection` green. Commit.
- [x] **Visual gate (ask the user):** the row appears in Display; switching each
      frame animates a ~1 s roll that levels the intended plane and holds the
      subject; the URL gains `orientation=<frame>` for a non-default choice.

---

## Task 15: Authored-literal re-tune (visual-gated)

**Files:** `src/services/engine/camera/cameraFraming.ts` (`BOOT_YAW_RAD` /
`BOOT_PITCH_RAD` `:39-40`), `src/data/animation/clips/cosmicFlows.ts:72`,
`src/data/animation/clips/earthFlyout.ts:78-79`,
`src/data/animation/tours/grandTour/approachM31.ts:49-50`,
`src/data/animation/tours/grandTour/localGroup.ts:82-83`.

Yaw/pitch are interpreted in the active frame through the shared encode/decode
pair, so **derived** poses (path tangents, foci framing, relative `spin`/`rate`
legs) are world-invariant. Only the handful of **absolute** literals shift meaning
under the new ecliptic default and get a one-time re-tune (spec §6). This is a
tuning step, not a maths step: the implementer **may not** claim visual
verification — each sub-item asks the user to look (dev server running).

- [x] `BOOT_YAW_RAD` / `BOOT_PITCH_RAD` — the real first-paint pose. Re-tune under
      ecliptic. Note: `cameraSlice.ts:56-57` base `yaw 0 / pitch 0` is a
      placeholder `commitCameraPose` overwrites via bootstrap — no re-tune there
      beyond the boot bearing. The grand-tour `openingTitle.ts:75` and
      `homeAgain.ts:45` reference `BOOT_YAW_RAD` / `BOOT_PITCH_RAD` directly, so
      they re-tune for free once the boot constants are set.
- [x] `cosmicFlows.ts:72` (`start: { yaw: 4.44, pitch: 0.2932 }`) — absolute start
      pose; re-tune.
- [x] `earthFlyout.ts:78-79` (`yaw: 0, pitch: 0`) — absolute opening angles;
      re-tune.
- [x] Grand-tour waypoint pins — the hardcoded absolute bearings
      `approachM31.ts:49-50` (`ARRIVAL_YAW_RAD` / `EXIT_YAW_RAD`) and
      `localGroup.ts:82-83`. Re-tune the pinned absolutes only; relative legs hold.
      If a specific beat genuinely breaks only when *played in a non-default frame*,
      that is a targeted pin fix, not a framework (Q5 rejects a per-clip
      authoring-frame tag).
- [x] **Ask the user to confirm** each pose reads correctly under the ecliptic
      default before committing. Commit the re-tune once confirmed.

---

## Task 16: entanglement-radar review

**Files:** none (review pass).

- [x] Run the `entanglement-radar` skill over the feature diff (`simplicity.md`
      convention). Focus points:
  - Is `frameBasis` written by exactly one per-frame authority (`runFrame` →
    `resolveFrameBasis`) and read (never re-resolved) by the decode / encode / up
    consumers? No renderer or subsystem should mirror-resolve the basis.
  - `setOrientation` (snap) and `startFrameTween` (animate) stay orthogonal — no
    path fuses them except the two that deliberately dispatch both (the
    interactive saga and the `frameTo` cue). The UI dispatches only the
    `requestOrientationChange` intent; only the saga + the cue touch the camera
    slice, and the URL/boot read snaps via `setOrientation` alone.
  - The `fromQuat` is captured from the live `B(t)` on `cameraRuntime` in **both**
    switch surfaces (saga + cue), via the one stashed value — no second capture
    convention, and no committed-frame fallback that would snap a mid-slerp switch.
  - No branch on "is the camera idle or driven" — the one mechanism (decode
    through `B(t)`) covers both (spec §3.5).
- [x] Address anything flagged (default is to un-braid, not defend); re-run
      `npm test` + `npm run typecheck`. Commit any fixes.

---

## Task 17: iOS WebGPU check + PR finalisation

**Files:** none (verification) + PR description.

- [x] **iOS WebGPU check** (spec §11): **deferred** — iOS hardware not reachable
      this session. The feature touches no shader/WGSL/uniform-layout path; every
      basis change is CPU-side (`Mat3` maths into `lookAt` up + `updatePosition`),
      so the shared-encoder frame-drop class of bug does not apply. Deferred with a
      note as prior features have.
- [x] PR description: names the two prereq prep PRs, the Task 14/15 visual gates
      and their user-confirmed outcomes, and the re-tune. Notes **no R2 sync**
      (code only — no `.bin` change).
- [x] Run `/feature-done` before merge (sweeps the DoD + relocates this plan and
      the spec to `plans/completed/` + `specs/completed/`), per the
      "/feature-done BEFORE merge" convention.

---

## Coverage check (spec §3.2–§8, §10)

| Spec | Task |
| ---- | ---- |
| §3.2 settings field / default / reducer / selector | 1 |
| §3.3 `FrameTween` + slice + `selectCameraActive` + `frameTweenElapsed` | 2, 3 |
| §3.4 `resolveFrameBasis`, `frameBasis`, decode / encode / up, produce-once | 4, 5, 6, 7, 8, 9 |
| §3.5 one mechanism (no idle/driven branch) | 5, 9, 16 |
| interactive switch = live-basis capture (intent + saga) | 10 |
| §4 `frameTo` cue (live-basis capture) | 11 |
| §5 URL source + boot ordering | 12, 13 |
| §6 authored-literal re-tune | 15 |
| §7 consumption path unchanged | (guarded — Tasks 8/9 keep position/target world-equatorial) |
| §8 UI Display row | 14 |
| §10 round-trip | 6 |
| §10 slerp endpoints + orthonormal midpoints | 4 |
| §10 hold-pose invariance | 9 |
| §10 `PITCH_LIMIT` edge | 9 |
| §10 URL write-null + boot snap | 12, 13 |
| §10 `frameTo` compile + fire | 11 |
| §10 WESL parity | Prep 2 (out of scope here) |
| §11 iOS check | 17 |
