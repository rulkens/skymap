# Camera intent into the store; pose derived in the frame (plan)

> **For agentic workers.** Execute this plan via the
> **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`** — a fresh
> subagent per task, with the spec + per-task `Interfaces` block as its brief,
> plus the spec/quality reviews that workflow gates on. Each task is a TDD loop:
> write the failing test → run it and confirm it fails → minimal implementation
> → confirm it passes → commit.

**Goal.** Fold the mutable `OrbitCamera` (`state.cam`) Intent into a new `camera`
Redux root slice — `base` resting pose, a timeless `tween` descriptor, `autoRotate`
params, and a `dragging` flag — and produce the per-frame pose from the existing
`CameraDriver` table (reworked to RETURN a pose) plus engine-owned clock/gesture
Resources. No per-frame dispatch: every non-resting driver commits its last pose
into `base` on its deactivation edge. `state.cam` survives as the transient drag
gesture register.

**Architecture.** `orbitControls` keeps its orbit/pan/zoom math but mutates the
transient register `state.cam`, seeding it from `base` on grab and flipping
`dragging` via `beginDrag`/`endDrag` gesture hooks; `onCameraChange` becomes a
single `onChange → requestRender`. The driver table (`orbitDrag` 80 → `tween` 60 →
`autoRotate` 20 → `resting` 0) yields the winner's pose; `deriveFrameContext`
produces it, merges the engine's live projection config (fov/aspect/near/far) onto
the driver's orbit params, computes `position`, and dispatches one
`commitCameraPose(lastPose)` on the deactivation edge. The wake rides a generalized
`watchWake` driven by a `WAKE_ROUTES` set covering `camera`. `tweenManager`
dissolves into `state.camera.tween` + the `tween` driver.

**Tech Stack.** TS + Redux Toolkit (inline-Immer slice) + `typed-redux-saga` +
`redux-saga`; React 19 + `react-redux`; Vitest; gl-matrix; raw WebGPU engine in
`src/services/engine`.

**Source of truth.** The approved design
[`2026-06-19-camera-intent-slice-design.md`](../specs/2026-06-19-camera-intent-slice-design.md).
Read it fully before starting; this plan is its §8 build order broken into TDD
tasks. [`intent.md`](../conventions/intent.md) §5 (the orbit-camera refinement
note at the end of its References) + [`simplicity.md`](../conventions/simplicity.md)
§5/§7/§8 carry the rationale. **Builds on** the landed reconcile-sagas seam (PR
#352): `setSagaContext` / `ReconcileEffects` / `getContext('reconcile')` /
`watchWake` are on `main`.

## Global Constraints

- TS: `export type X = …`, never `interface`. **One type per file** under
  `src/@types/` (filename = exported type) — `CameraState.d.ts`,
  `CameraTweenDescriptor.d.ts` are separate files. Single-function files in
  `utils/` named for the function. No barrels; deep relative imports. Use `Vec3`
  (`src/@types/math/Vec3`) for the target, never a raw `[number, number, number]`.
- The slice is **inline-Immer** like `settingsSlice` (mutate the draft;
  primitive/whole-object reducers may return). Name slice-reducer args
  `camera`/`action`, never terse `s`/`a`.
- Tests: Vitest. Typed `vi.fn<() => void>()` (and
  `vi.fn<(p: CameraPose) => void>()` etc.) — bare `vi.fn()` fails tsc against typed
  callback fields. Mirror `tests/store/effects/reconcileSagas.test.ts`'s real
  `configureStore` + saga-middleware harness for saga tests.
- Didactic comments: explain *why* + the rejected alternative, matching the
  multi-paragraph module headers already on `cameraDrivers.ts` / `orbitControls.ts`
  / `tweenManager.ts`. Comments timeless + terse — no dates, no PR refs, no
  "pre-X" history notes.
- Branch + PR, squash-merge. Commit with the user's git identity (Co-Authored-By
  trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,
  never `--author`). Stage specific paths, never `git add -A`. Prettier only the
  files you touched.
- **The suite stays green at EVERY task.** The cutover rule (spec §8): never
  derive-from-the-new-home before every writer fills it — `state.cam` stays the
  authoritative read until Phase 3. Phase 2 keeps `state.cam` in sync with a
  temporary per-frame write so each step renders identically; that bridge is what
  makes a green step possible at every cut.

## Naming contracts (spelled identically everywhere)

| Name | Kind | Home |
| --- | --- | --- |
| `CameraState` | type | `src/@types/camera/CameraState.d.ts` |
| `CameraPose` | type — `{ target: Vec3; yaw; pitch; distance }` (the orbit params; `base`'s shape, the produced-pose payload) | `src/@types/camera/CameraPose.d.ts` |
| `CameraTweenDescriptor` | type — `{ from: CameraPose; to: CameraPose; durationMs; easing }` | `src/@types/camera/CameraTweenDescriptor.d.ts` |
| `cameraRoute` | const `'camera'` | `src/store/constants.ts` |
| `cameraSlice` reducers — `beginDrag`, `endDrag`, `commitCameraPose`, `startCameraTween`, `cancelCameraTween`, `setAutoRotate` | slice | `src/state/camera/cameraSlice.ts` |
| `selectCameraIntent`, `selectCameraActive`, `selectCameraBase`, `selectAutoRotate` | selectors | `src/state/camera/selectors.ts` |
| `evaluateTween` | fn — `(d: CameraTweenDescriptor, elapsedMs: number) => CameraPose` | `src/services/engine/camera/evaluateTween.ts` |
| `spinAutoRotate` | fn — `(base: CameraPose, rate: number, elapsedMs: number) => CameraPose` | `src/services/engine/camera/spinAutoRotate.ts` |
| `runCameraDrivers` (now returns `CameraPose`), `buildCameraDrivers` | fn | `src/services/engine/camera/cameraDrivers.ts` |
| `CameraDriver` — `{ id, priority, isActive(s), pose(s, cam, elapsedMs) }` | type | `src/@types/engine/camera/CameraDriver.d.ts` |
| `WAKE_ROUTES` | const `Set<string>` (`settings` + `camera`) | `src/store/effects/reconcileSagas.ts` |
| `assembleOrbitCamera` | fn — merge `CameraPose` + engine projection config → `OrbitCamera` | `src/services/engine/camera/assembleOrbitCamera.ts` |

> **Naming note — `CameraPose` vs `OrbitCamera`.** `CameraPose` is the four orbit
> params the drivers produce (the spec writes `base { target, yaw, pitch, distance }`).
> `OrbitCamera` is the full live struct (pose + `fovYRad`/`aspect`/`near`/`far` +
> derived `position`). The drivers traffic in `CameraPose`; `assembleOrbitCamera`
> (Open item 3) lifts a `CameraPose` to an `OrbitCamera` by merging the engine's
> live projection config and computing `position`. Keep the two names distinct —
> a `CameraPose` never carries projection or `position`.

---

## Open items resolved in this plan

1. **`from = lastPose` capture (spec §1, §5).** `tweenToGalaxy` / `tweenToStructure`
   / `tweenToCameraSnapshot` are already engine-side and already read the live pose
   (`cam.target`/`distance`/`yaw`/`pitch`, `tweenToGalaxy.ts:104-111`). In the new
   model they read the engine's `lastPose` (the last produced `CameraPose`, held as
   an engine Resource) as `from`, build a `CameraTweenDescriptor`, and dispatch
   `startCameraTween`. The clock zeroes when the `tween` descriptor's reference
   identity changes (Task 2.1's engine clock). **Tasks 2.1, 2.2.**
2. **No per-driver lifecycle on `CameraDriver` (spec §1 "One lifecycle", §6).**
   `CameraDriver` stays exactly `{ id, priority, isActive, pose }` — NO `enter`/
   `exit`. Lifecycle lives in the frame, keyed on store-state transitions: (a)
   commit-on-edge compares `prevActiveId` vs current in `deriveFrameContext`; (b)
   clock-reset: the engine tracks the last-seen `tween` ref + `autoRotate.active`
   and zeroes the relevant clock on change; (c) drag-seed lives in
   `orbitControls.onGestureStart`. **Task 3.1** asserts `CameraDriver` did NOT grow
   `enter`/`exit`.
3. **fov/aspect/near/far stay an engine Resource, OUT of slice `base` (spec §1
   table footnote, §2 clamps).** The slice holds only `CameraPose` (orbit params).
   `deriveFrameContext` calls `assembleOrbitCamera(pose, projection)` where
   `projection` is the engine's live `{ fovYRad, aspect, near, far }` (aspect
   updated on resize at `runFrame.ts:96-98`); the helper computes `position`. The
   slice is therefore projection-free and serializable. **Task 1.5 + 3.2.**
4. **SpaceMouse / raw input (spec scope).** Audit confirms skymap has **no**
   SpaceMouse / HID / gamepad / continuous non-mouse camera-driving input — the only
   `SpaceMouse` token in the tree is an unrelated debug label, and the sole
   camera-writer is `orbitControls` (`attachOrbitControls`, attached once at
   `wireInput.ts:248`). There is no `src/services/input/` directory. A dedicated
   SpaceMouse driver is out of scope; **no input source other than `orbitControls`
   touches the camera, so nothing else needs routing through `state.cam` /
   `dragging`.** This is stated as a finding, not a task — verify it still holds at
   Task 4.1 (grep `cam.yaw|cam.pitch|cam.distance|cam.target` outside
   `orbitControls`/`cameraTween`/drivers; expect none) and record the result.

---

## Phase 1 — Slice + pure pieces, no consumers (additive)

Mirrors spec §8.1. The slice, `cameraRoute`, selectors, the pure `evaluateTween`
/ `spinAutoRotate` / `assembleOrbitCamera` helpers, and the `CameraDriver.pose`
rework all land additively. The engine still reads/writes `state.cam` through the
old `apply`-style drivers (kept temporarily); nothing consumes the slice yet.
Suite green throughout.

### Task 1.1 — `CameraPose` + `CameraTweenDescriptor` + `CameraState` types

**Files:**
- `src/@types/camera/CameraPose.d.ts` (create).
- `src/@types/camera/CameraTweenDescriptor.d.ts` (create).
- `src/@types/camera/CameraState.d.ts` (create).
- No test (pure type decls — exercised by Task 1.2's reducer tests).

**Signatures:**

```ts
// CameraPose.d.ts — the orbit params the drivers produce; base's shape.
export type CameraPose = { target: Vec3; yaw: number; pitch: number; distance: number };

// CameraTweenDescriptor.d.ts — timeless: absolute from/to poses, no startMs.
export type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  durationMs: number;
  easing: 'easeOutCubic';   // single curve today (spec out-of-scope: easing math)
};

// CameraState.d.ts
export type CameraState = {
  base: CameraPose;
  tween: CameraTweenDescriptor | null;
  autoRotate: { active: boolean; rate: number };
  dragging: boolean;
};
```

- [x] Create the three files (one type each, `Vec3` import from `../math/Vec3`).
  Didactic header on `CameraTweenDescriptor`: timeless by design — `from`/`to` are
  absolute poses, the clock is an engine Resource, so the descriptor needs no
  `startMs` (contrast the old `CameraTween.startMs`, `CameraTween.d.ts:17`).
- [x] `npm run typecheck` → clean. Commit.

### Task 1.2 — the `camera` slice + `cameraRoute`

**Files:**
- `src/store/constants.ts` (modify) — add `export const cameraRoute = 'camera' as const;`.
- `src/state/camera/cameraSlice.ts` (create) — inline-Immer, mirror `settingsSlice`.
- `tests/state/camera/cameraSlice.test.ts` (create).

**Interfaces:** Consumes `createSlice`, `PayloadAction` from `@reduxjs/toolkit`;
`CameraState`, `CameraPose`, `CameraTweenDescriptor`. Initial state: `base` seeded
to a neutral resting pose (target `[0,0,0]`, yaw/pitch `0`, distance the existing
boot default — cite the value the engine boots with rather than inventing one;
`computeInitialCamera` overwrites it at bootstrap regardless, so the seed is a
placeholder), `tween: null`, `autoRotate: { active: DEFAULT_AUTO_ROTATE, rate: <the
auto-rotate rate> }`, `dragging: false`.

Reducers (spec §2):

```ts
beginDrag (camera) { camera.dragging = true; }
endDrag   (camera) { camera.dragging = false; }
commitCameraPose (camera, action: PayloadAction<CameraPose>) { camera.base = action.payload; }
startCameraTween  (camera, action: PayloadAction<CameraTweenDescriptor>) { camera.tween = action.payload; }
cancelCameraTween (camera) { camera.tween = null; }
setAutoRotate     (camera, action: PayloadAction<{ active: boolean; rate: number }>) { camera.autoRotate = action.payload; }
```

> **rate-source note.** The old auto-rotate was a per-frame yaw delta constant
> (`AUTO_ROTATE_YAW_DELTA = 0.000873`, `cameraDrivers.ts:87`). The slice's `rate`
> carries that same value (radians/frame for now — `spinAutoRotate` consumes it in
> Task 1.4). Do NOT change the motion feel: reuse the exact constant.

- [x] `commitCameraPose replaces base` — dispatch with a `CameraPose`, assert
  `state.camera.base` equals it.
- [x] `startCameraTween installs the descriptor` / `cancelCameraTween clears it to null`.
- [x] `beginDrag / endDrag flip dragging`.
- [x] `setAutoRotate replaces the autoRotate object`.
- [x] `initial state is serializable` — assert no `Set`/class/`position`/`fovYRad`
  on the state (plain data, clock-free — spec §6).
- [x] Confirm fail → implement → pass. `npm test -- cameraSlice`. Commit.

### Task 1.3 — register the slice in `rootReducer` + selectors

**Files:**
- `src/store/rootReducer.ts` (modify) — add `[cameraRoute]: cameraReducer` to the
  `combineReducers` map (`rootReducer.ts:24-28`).
- `src/state/camera/selectors.ts` (create).
- `tests/state/camera/selectors.test.ts` (create).

**Interfaces:** Consumes `RootState` (`../../store/types`), `CameraState`,
`CameraPose`, `CameraTweenDescriptor`. Produces:

```ts
export const selectCameraIntent = (state: RootState): CameraState => state.camera;
export const selectCameraBase   = (state: RootState): CameraPose => state.camera.base;
export const selectAutoRotate   = (state: RootState): boolean => state.camera.autoRotate.active;
// the loop-continuation predicate (spec §4):
export const selectCameraActive = (state: RootState): boolean =>
  state.camera.dragging || state.camera.tween !== null || state.camera.autoRotate.active;
```

> `selectAutoRotate` deliberately reuses the existing selector NAME (the settings
> one at `selectors.ts:84`) but reads the camera slice. Task 5.x removes the old
> settings selector; until then the two coexist with different import paths — the
> App migration (Task 5.1) flips the import.

- [x] `RootState gains a typed camera slot` (tsc: `state.camera.base` resolves).
- [x] `selectCameraActive is true while dragging / tween / autoRotate, false at rest`
  (four cases).
- [x] Confirm fail → implement → pass. `npm test -- camera` + `npm run typecheck`.
  Commit.

### Task 1.4 — pure `evaluateTween` + `spinAutoRotate`

**Files:**
- `src/services/engine/camera/evaluateTween.ts` (create) — reuse the easing math
  from `cameraTween.ts:69-104` (target/distance lerp, shortest-arc yaw, pitch lerp,
  `easeOutCubic`), but RETURN a `CameraPose` from `(descriptor, elapsedMs)` instead
  of mutating `cam` from `(cam, tween, nowMs)`. No `updatePosition` here — pose
  carries no `position`.
- `src/services/engine/camera/spinAutoRotate.ts` (create).
- `tests/services/engine/camera/evaluateTween.test.ts` (create).
- `tests/services/engine/camera/spinAutoRotate.test.ts` (create).

**Signatures:**

```ts
export function evaluateTween(d: CameraTweenDescriptor, elapsedMs: number): CameraPose;
export function spinAutoRotate(base: CameraPose, rate: number, elapsedMs: number): CameraPose;
```

`evaluateTween`: `t = easeOutCubic(clamp01(elapsedMs / d.durationMs))`; lerp
`from`→`to` per channel (shortest-arc yaw via `lerpAngleShortest`,
`utils/math/lerpAngleShortest`). At/after `durationMs`, returns `to` exactly
(saturation — mirrors `cameraTween.ts:72-74`). `spinAutoRotate`: returns
`{ ...base, yaw: base.yaw + rate * <frames in elapsedMs> }` reproducing the old
per-frame `cam.yaw += AUTO_ROTATE_YAW_DELTA` feel. **Decide the elapsed→spin mapping
explicitly:** the old code spun a fixed delta PER FRAME, not per ms. To preserve
feel without leaking frame count into the store, `spinAutoRotate` takes `elapsedMs`
and converts via the assumed 60fps frame budget (`rate * elapsedMs / FRAME_MS`),
OR `rate` is redefined as radians/ms — pick one in the test's assertion and document
why. (Either is fine; the constraint is "same visible drift speed as today.")

- [x] `evaluateTween at elapsed 0 returns from` / `at >= durationMs returns to exactly`.
- [x] `evaluateTween eases yaw the short way around the circle` (a from/to crossing
  ±π picks the short arc — mirror the existing `lerpAngleShortest` coverage).
- [x] `evaluateTween is pure` — same inputs → deep-equal pose, input descriptor
  unmutated.
- [x] `spinAutoRotate advances yaw by the documented rate, leaves target/pitch/distance` /
  `spinAutoRotate is pure` (base unmutated).
- [x] Confirm fail → implement → pass. `npm test -- evaluateTween spinAutoRotate`.
  Commit.

### Task 1.5 — `assembleOrbitCamera` (pose + projection → OrbitCamera)

**Files:**
- `src/services/engine/camera/assembleOrbitCamera.ts` (create).
- `tests/services/engine/camera/assembleOrbitCamera.test.ts` (create).

**Signature** (Open item 3):

```ts
type CameraProjection = { fovYRad: number; aspect: number; near: number; far: number };
export function assembleOrbitCamera(pose: CameraPose, projection: CameraProjection): OrbitCamera;
```

Builds the full `OrbitCamera` by spreading `pose` + `projection` and computing
`position` via the existing `updatePosition` (`services/camera/orbitCamera`). Keep
`CameraProjection` inline in this file OR as its own `@types/camera/CameraProjection.d.ts`
(one-type-per-file — prefer the `.d.ts` if it's exported/reused; the engine clock
task will reuse it, so create the `.d.ts`).

- [x] `assembleOrbitCamera merges pose + projection and derives position` — assert
  `result.fovYRad === projection.fovYRad`, `result.target === pose.target`, and
  `result.position` matches `updatePosition` for that pose (compute the expected via
  the same helper, or assert against a known orbit geometry).
- [x] `the produced camera carries no extra fields` (shape pin).
- [x] Confirm fail → implement → pass. `npm test -- assembleOrbitCamera`. Commit.

### Task 1.6 — `CameraDriver.pose` + `runCameraDrivers` returns a pose

**Files:**
- `src/@types/engine/camera/CameraDriver.d.ts` (modify) — replace `apply(cam, nowMs): void`
  with `pose(s: RootState, cam: OrbitCamera, elapsedMs: number): CameraPose`; change
  `isActive(nowMs)` → `isActive(s: RootState)`. Update the didactic header (drop the
  "mutates cam in place / camera IS the output" framing; the driver now RETURNS a
  pose).
- `src/services/engine/camera/cameraDrivers.ts` (modify) — `runCameraDrivers` returns
  the winner's `pose(...)` (max-scan unchanged, `cameraDrivers.ts:56-78`); when no
  driver is active it still must return something — but `resting` (priority 0,
  `isActive: () => true`) is always active once Phase 2 adds it. **In Phase 1 the old
  driver set has no always-active floor**, so guard: this task reworks the SIGNATURE
  and the resolver to return `CameraPose`, but `buildCameraDrivers` keeps the
  existing two drivers temporarily wrapping the old behaviour (see below). The
  resolver returning a pose when a driver is active is the contract; the
  always-active `resting` floor arrives in Task 2.3.
- `tests/services/engine/camera/cameraDrivers.test.ts` (modify) — the existing
  purity test now asserts the resolver RETURNS the winner's pose (not that it called
  `apply`).

**Interfaces:**

```ts
export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  isActive(s: RootState): boolean;
  pose(s: RootState, cam: OrbitCamera, elapsedMs: number): CameraPose;
};

// Phase-1 signature. The `elapsedMs` arg is a placeholder here (the shim drivers
// ignore it). Task 2.3 changes this to take the CLOCK + nowMs once the real
// tween/autoRotate drivers need per-driver elapsed (see the correctness pin there).
export function runCameraDrivers(
  drivers: readonly CameraDriver[], s: RootState, cam: OrbitCamera, elapsedMs: number,
): CameraPose;
```

**Bridging detail (suite-green).** `buildCameraDrivers` is NOT rewritten to read
store intent yet — that's Phase 2. This task changes the type + resolver shape AND
adds an **always-active `resting` floor** so the resolver can always return a
`CameraPose` (no nullable return, no inactive-`drivers[0]` fallback bug — the
max-scan must start from the always-active floor, not `drivers[0]` blindly). In
Phase 1 `resting`'s `pose` returns the live `cam`'s pose (`poseOf(cam)`) — a stand-in
that makes "nothing else active" a no-op identical to today; Task 2.3 switches it to
`s.camera.base`. The other two temporary drivers wrap the old behaviour: their `pose`
reads/advances the live `cam` the way `apply` did and returns the resulting
`CameraPose` (the engine writes that pose back onto `state.cam` at the call site —
Task 1.7). This is the throwaway shim the spec's §8.1 allows; deleted in Phase 2.

- [x] Update the purity test to assert `runCameraDrivers(drivers, s, cam, e)` returns
  the highest-priority active driver's pose (fake drivers returning sentinel poses,
  a fake `RootState`, a throwaway `cam`).
- [x] `runCameraDrivers picks by priority, not list order` (sentinel poses).
- [x] `with only resting active, the resolver returns resting's pose` (the always-active
  floor — no nullable return, never an inactive driver).
- [x] Confirm fail → implement → pass. `npm test -- cameraDrivers`. Commit.
  (Shipped jointly with Task 1.7 as one green commit — a resolver signature change
  cannot be green without its call site.)

### Task 1.7 — engine writes the returned pose back onto `state.cam` (shim)

**Files:**
- `src/services/engine/frame/runFrame.ts` (modify — the `runCameraDrivers` call at
  `runFrame.ts:140-142`). The resolver now returns a `CameraPose`; the call site
  writes it onto `state.cam` (target/yaw/pitch/distance) + `updatePosition` so every
  downstream read (`deriveFrameContext`, renderers) is byte-identical to today.
- `src/@types/engine/frame/RunFrameDeps.d.ts` — no change yet (`drivers` field stays).
- The engine's `elapsedMs` argument: pass `0` or a trivial value this task — the
  temporary drivers ignore it (they read live `cam`). The real clock arrives in Task 2.1.
- `tests/services/engine/` — an existing runFrame/frame test that exercises the
  camera path; assert the camera still advances identically (or rely on the
  unchanged visible behaviour + the resolver test).

- [x] Adjust the call site to consume the returned pose and write it back +
  `updatePosition`. `shouldKeepTicking` still reads `drivers.some(d => d.isActive(...))`
  — update its `isActive(nowMs)` → `isActive(s)` call to pass the store state
  (`shouldKeepTicking.ts`), threading `RootState` in (read via the engine's store,
  `deps.cb.store.getState()`).
- [x] `npm test` (full suite) + `npm run typecheck` → green. Behaviour unchanged.
  Commit. (Also repaired the pre-existing `cameraDriverWrappers`, `runFrame`,
  `shouldKeepTicking`, and `rootReducer` tests to the new signatures.)

---

## Phase 2 — Writers populate the slice, engine still reads `state.cam` (bridge)

Mirrors spec §8.2. Each producer starts WRITING its slice Intent while a temporary
per-frame sync keeps `state.cam` authoritative for the read. Every step renders
identically. Suite green throughout.

### Task 2.1 — engine animation clock (Resource) + `lastPose` / `prevActiveId`

**Files:**
- `src/@types/engine/camera/CameraClock.d.ts` (create) — the engine-owned clock
  Resource shape (`tweenStartMs`, `autoRotateStartMs`, `lastTweenRef`,
  `lastAutoRotateActive`).
- `src/services/engine/camera/cameraClock.ts` (create) — `createCameraClock()` +
  `elapsedFor(clock, driverId, nowMs)` that returns ms since that driver's
  descriptor identity last changed, resetting on change.
- `tests/services/engine/camera/cameraClock.test.ts` (create).

**Interfaces:** the clock is a small mutable Resource (allowed — it's the engine's
transient layer, not the store; spec §1 table). Produces:

```ts
export type CameraClock = {
  tweenStartMs: number | null;
  autoRotateStartMs: number | null;
  lastTweenRef: CameraTweenDescriptor | null;
  lastAutoRotateActive: boolean;
};
export function createCameraClock(): CameraClock;
// resets the relevant start when the descriptor identity / active bit changed,
// then returns elapsed ms for the requested driver.
export function tweenElapsed(clock: CameraClock, tween: CameraTweenDescriptor | null, nowMs: number): number;
export function autoRotateElapsed(clock: CameraClock, active: boolean, nowMs: number): number;
```

> **Why ref-identity, not deep-equal (Open item 1).** A new `startCameraTween`
> dispatch installs a NEW descriptor object; comparing by `===` against
> `lastTweenRef` detects "a fresh tween started" and zeroes `tweenStartMs`. This is
> the clock-reset the spec §1 "Enter" bullet describes — no per-driver `enter` hook
> needed (Open item 2).

- [x] `tweenElapsed returns 0 on the frame a new descriptor reference appears`
  (different object) `and grows on subsequent frames with the same reference`.
- [x] `autoRotateElapsed resets to 0 when active flips false→true`.
- [x] `the clock never reads wall-clock from the store` (it takes `nowMs` as an arg
  — purity-of-source pin).
- [x] Confirm fail → implement → pass. `npm test -- cameraClock`. Commit.

### Task 2.2 — tween writer: focus handlers dispatch `startCameraTween`

**Files:**
- `src/services/engine/camera/tweenToGalaxy.ts`,
  `src/services/engine/camera/tweenToStructure.ts`,
  `src/services/engine/camera/cameraSnapshot.ts` (modify) — replace the
  `state.subsystems.tweens.start({...})` literal (`tweenToGalaxy.ts:98-112`,
  `tweenToStructure.ts:29-46`, `cameraSnapshot.ts:65-76`) with building a
  `CameraTweenDescriptor` (`from = engine lastPose`, `to = { target, yaw, pitch,
  distance }`) and `store.dispatch(startCameraTween(descriptor))`. They need the
  store + `lastPose`; thread those via `state` (the engine exposes `lastPose` as a
  Resource the frame updates — read it off `state` or a passed accessor).
- The `tween` driver row + the temporary `state.cam` sync (see Task 2.3).
- `tests/services/engine/camera/tweenToGalaxy.test.ts` (+ structure / snapshot
  tests if present) — repoint onto the dispatch.

**Interfaces:** `from` is the engine's `lastPose` (Open item 1), not `cam.target`
read inline — though during the bridge `lastPose` tracks `state.cam`, so the visible
result is identical. Build `to` from the target (galaxy diameter / structure radius
framing math is unchanged — `galaxyFocusDistance`, `structureFocusDistance` stay).

- [ ] `tweenToGalaxy dispatches startCameraTween with from=lastPose, to=target framing`
  — assert the dispatched descriptor's `from` equals the engine's current `lastPose`
  and `to.distance === galaxyFocusDistance(target.diameterKpc)`, `to.yaw === from.yaw`
  (orientation preserved).
- [ ] `tweenToStructure dispatches with to.distance === structureFocusDistance(radius, fovY)`.
- [ ] `cam-null window still no-ops` (pre-bootstrap / post-destroy — the existing
  guard's contract, `tweenToGalaxy.ts:95-96`).
- [ ] Confirm fail → implement → pass. `npm test -- tweenTo`. Commit.

> **Where the auto-rotate + drag writers land (spec §8.2 mapping).** The spec lists
> three Phase-2 writers (tween / auto-rotate / drag); two of them have no standalone
> Phase-2 deliverable and fold into the tasks below — recorded here so nothing is
> dropped:
>
> - **Auto-rotate writer.** The slice action `setAutoRotate` already exists (Task 1.2)
>   and the `autoRotate` DRIVER row lands in Task 2.3 below. The App toggle keeps
>   dispatching the OLD settings `setAutoRotate` until Task 5.1; in Phase 2 the new
>   `camera/setAutoRotate` is dispatched by nothing, so `state.camera.autoRotate`
>   stays its initial-state default. The bridge keeps `state.cam` authoritative, so
>   visible auto-rotate is unchanged. **Document this seam in the driver header so the
>   implementer doesn't wire the toggle early.**
> - **Drag writer.** `beginDrag` / `endDrag` depend on gesture hooks that don't exist
>   until Phase 4, so the ONLY drag-related slice write in Phase 2 is
>   `commitCameraPose` (the engine's commit-on-edge in Task 2.3), which seeds `base`.
>   `dragging` stays `false` (no `orbitDrag` win yet); the old `state.cam` mutation
>   still drives the visible drag through the bridge. `beginDrag`/`endDrag` +
>   `orbitDrag` activation land together with the gesture hooks in Phase 4 — wiring
>   them earlier would need the hooks to be green.

### Task 2.3 — `buildCameraDrivers` reads store intent; bridge sync + commit-on-edge

**Files:**
- `src/services/engine/camera/cameraDrivers.ts` (modify) — rewrite
  `buildCameraDrivers(state)` to return the four-row table reading STORE intent
  (`cameraDrivers.ts:106-128`):
  - `orbitDrag` (80): `isActive: (s) => s.camera.dragging`, `pose: (_s, cam) => poseOf(cam)`
    (the gesture register).
  - `tween` (60): `isActive: (s) => s.camera.tween !== null`,
    `pose: (s, _c, e) => evaluateTween(s.camera.tween!, e)`.
  - `autoRotate` (20): `isActive: (s) => s.camera.autoRotate.active`,
    `pose: (s, _c, e) => spinAutoRotate(s.camera.base, s.camera.autoRotate.rate, e)`.
  - `resting` (0): `isActive: () => true`, `pose: (s) => s.camera.base`.
- `src/services/engine/frame/runFrame.ts` (modify) — the resolver SIGNATURE changes to
  `runCameraDrivers(drivers, s, cam, clock, nowMs)` (the clock from Task 2.1; it
  computes the winner's elapsed internally). The call passes the store `RootState`, the
  gesture register `state.cam`, the engine `CameraClock`, and `nowMs`. **Bridge:** after
  producing the pose, still WRITE it onto `state.cam` + `updatePosition` (the read is
  still `state.cam`). Track `lastPose` (the produced pose) + `prevActiveId` (the winning
  driver's id) as engine Resources. Commit-on-edge: when `prevActiveId` changes away
  from a non-resting, non-orbitDrag driver, `store.dispatch(commitCameraPose(lastPose))`
  ONCE (spec §1 sketch, §4).
- `src/services/engine/camera/cameraDrivers.ts` (modify) — `runCameraDrivers` now takes
  the clock + nowMs and, after `pickWinner`, computes the winner's elapsed via
  `tweenElapsed` / `autoRotateElapsed` (Task 2.1) for `tween` / `autoRotate`, `0` for
  `orbitDrag` / `resting`, then calls `winner.pose(s, cam, elapsed)`.
- `src/services/engine/camera/activeDriverId.ts` (create) — `activeDriverId(drivers, s)`
  returns the winning driver's id. Extract a shared `pickWinner(drivers, s)` helper so
  `runCameraDrivers` and `activeDriverId` both call it — **one place decides the
  winner** (they must never diverge, else the committed pose and the rendered pose
  disagree).
- The engine bootstrap (modify) — **seed `base` from the initial camera.** Where the
  engine computes its initial pose (`computeInitialCamera` / the `state.cam` boot
  seed), dispatch `commitCameraPose(poseOf(initialCam))` once so `base` is authoritative
  BEFORE the Phase-3 cutover. Without this the read-flip (Task 3.2) would jump from the
  live `state.cam` to the placeholder slice `base` on the first resting frame.
- `tests/services/engine/camera/cameraDrivers.test.ts` + a frame/commit-on-edge test.

**Interfaces:**

```ts
export function buildCameraDrivers(state: EngineState): readonly CameraDriver[];
export function runCameraDrivers(
  drivers: readonly CameraDriver[], s: RootState, cam: OrbitCamera,
  clock: CameraClock, nowMs: number,
): CameraPose;                                            // signature changes HERE (was elapsedMs in 1.6)
export function pickWinner(drivers: readonly CameraDriver[], s: RootState): CameraDriver;
export function activeDriverId(drivers: readonly CameraDriver[], s: RootState): string;
```

> **Why clock-not-elapsedMs (correctness pin).** `tween` and `autoRotate` read
> different clocks (`tweenStartMs` vs `autoRotateStartMs`). A single `elapsedMs` arg
> can't serve both, and the caller can't pre-compute the right one before the winner
> is scanned. So `runCameraDrivers` picks the winner via `pickWinner`, then computes
> THAT winner's elapsed from the clock, then calls its `pose`. The Phase-1 `elapsedMs`
> placeholder (Task 1.6) is replaced by this.

> **Bridge is load-bearing for green.** Until Phase 3, the read of truth is still
> `state.cam`. Phase 2 writes the produced pose back onto `state.cam` AND begins
> committing into `base`. Because the old shim drivers are gone now (replaced by the
> store-reading table) but `tween`/`autoRotate` slice writers ARE live (Tasks 2.2,
> and the slice default for auto-rotate), the produced pose equals today's pose
> frame-for-frame. The `commitCameraPose` edge seeds `base` so the cutover (Phase 3)
> has a correct resting pose to fall back to.

> **commit-on-edge guard (spec §4, §6 "fires once per transition").** Compare
> `prevActiveId` to the current `activeDriverId`; dispatch only when leaving a
> non-resting driver (`tween` / `autoRotate` — and later `orbitDrag`), never on
> entering `resting` from `resting`, never per frame. Assert this with the edge test.

- [ ] `buildCameraDrivers exposes orbitDrag/tween/autoRotate/resting by priority` —
  assert the four ids + priorities (80/60/20/0).
- [ ] `the tween driver's pose is evaluateTween(slice.tween, elapsed)` (fake state
  with a descriptor, assert the produced pose matches `evaluateTween`).
- [ ] `the resting driver returns base` / `resting is always active`.
- [ ] `base is seeded from the initial camera at bootstrap` — assert a single
  `commitCameraPose` is dispatched during engine init and `state.camera.base` equals
  `poseOf(initialCam)` (so the Phase-3 cutover has the right resting pose, no jump).
- [ ] `pickWinner is the single winner-decider` — `runCameraDrivers` and
  `activeDriverId` return a consistent winner for the same `(drivers, state)`.
- [ ] `commitCameraPose fires once on a tween→resting edge with the last produced pose`
  — drive a fake frame where the tween elapses; assert exactly one
  `commitCameraPose(lastPose)` dispatch and `base === evaluateTween(descriptor,
  elapsedAtFinish)`.
- [ ] `commitCameraPose does NOT fire while a driver stays active` (per-frame guard).
- [ ] `no jump on grab mid-tween` — spec §6 invariant: with a tween active, simulate
  the edge and assert `base == evaluate(descriptor, elapsedAtGrab)` (the next driver
  starts where the last left off).
- [ ] Confirm fail → implement → pass. `npm test` (full) + `npm run typecheck` →
  green. Commit.

---

## Phase 3 — Flip the read (cutover)

Mirrors spec §8.3. `deriveFrameContext` switches to producing the OrbitCamera from
the driver pose + projection; `state.cam` becomes ONLY the `orbitDrag` register; the
temporary per-frame `state.cam` write is deleted.

### Task 3.1 — assert `CameraDriver` did NOT grow `enter`/`exit` (Open item 2)

**Files:**
- `tests/services/engine/camera/cameraDriverShape.test.ts` (create) — a compile-time
  + runtime pin that `CameraDriver` is exactly `{ id, priority, isActive, pose }`.

**Interfaces:** none new. A `keyof CameraDriver` exhaustiveness check (a typed const
array of the four keys assigned to `readonly (keyof CameraDriver)[]`), plus a runtime
assertion over a sample driver's own-keys.

- [ ] `CameraDriver has exactly id/priority/isActive/pose — no enter/exit` (tsc-level:
  assigning `'enter'` to a `keyof CameraDriver` slot is a type error; assert the key
  set length is 4).
- [ ] `npm test -- cameraDriverShape` + `npm run typecheck` → green. Commit.

### Task 3.2 — `deriveFrameContext` produces the pose; merge projection; cutover

**Files:**
- `src/services/engine/frame/frameContext.ts` (modify — `deriveFrameContext`,
  `frameContext.ts:109-155`). Today it reads `state.cam` directly
  (`frameContext.ts:119,129-131`). After: produce the pose from
  `runCameraDrivers(drivers, store.getState(), state.cam, elapsedMs)`, then
  `assembleOrbitCamera(pose, projection)` where `projection` is the engine's live
  `{ fovYRad, aspect, near, far }` Resource (Open item 3). The assembled
  `OrbitCamera` flows into `vp`/`drawCamPos`/`drawPxPerRad` exactly as today.
  `deriveFrameContext` gains the `drivers` + store + clock as params (thread via
  `RunFrameDeps` / `state`).
- `src/services/engine/frame/runFrame.ts` (modify) — DELETE the temporary
  `state.cam`-write shim (the produced-pose-back-onto-`state.cam` line from Task 1.7 /
  2.5). `state.cam` is now seeded only by `orbitDrag` (Phase 4); between gestures it's
  stale and unread (spec §3). The resize branch (`runFrame.ts:96-103`) still updates
  the engine's `aspect` projection Resource (not `state.cam.aspect` — relocate aspect
  onto the projection Resource as part of this cutover; document the move).
- `src/@types/engine/frame/RunFrameDeps.d.ts` — add the projection Resource +
  clock + store handle if not already reachable.
- `tests/services/engine/frame/` — a frameContext test asserting the produced VP
  matches the driver pose + projection.

> **Aspect relocation.** Today `state.cam.aspect` is patched on resize
> (`runFrame.ts:97`). With `state.cam` demoted to the drag register, aspect must live
> on the engine projection Resource that `assembleOrbitCamera` consumes. Move the
> resize patch to write the projection Resource's `aspect`; `assembleOrbitCamera`
> merges it onto every produced pose. Verify the scale-bar snapshot
> (`runFrame.ts:112-118`) reads fov from the projection Resource too.

- [ ] `deriveFrameContext produces the OrbitCamera from the winning driver pose + live projection`
  — fake state with a known `base` and projection; assert `ctx.cam.fovYRad` =
  projection fov and `ctx.vp` matches `computeViewProj(assembleOrbitCamera(base, projection))`.
- [ ] `resize updates the projection aspect, not a stale state.cam` — assert the
  produced camera's aspect tracks the resized canvas.
- [ ] `no jump on cutover` — the first resting frame AFTER the read-flip produces a
  pose equal to the pre-flip `state.cam` (relies on the bootstrap `base` seed from
  Task 2.3; if `base` were the placeholder this fails — the regression guard for the
  seed).
- [ ] `npm test` (full) + `npm run typecheck` → green. Commit.

---

## Phase 4 — Throttle-free input + wake

Mirrors spec §8.4. `orbitControls` gains gesture hooks + `onChange`; `orbitDrag`
activates via `beginDrag`/`endDrag`; `watchWake` generalizes to `WAKE_ROUTES`.

### Task 4.1 — `orbitControls` gesture hooks + `onChange` (rename), drag seeds `state.cam`

**Files:**
- `src/@types/camera/OrbitControlsOptions.d.ts` (modify) — ADD
  `onGestureStart?: () => void`, `onGestureEnd?: () => void`, `onChange?: () => void`;
  KEEP `onCameraChange?` for now (deleted in Task 5.x) so the rename is a clean
  two-step. (Or rename in place + repoint the one call site in the same task —
  implementer's call; the spec says `onChange` replaces `onCameraChange` 1:1.)
- `src/services/camera/orbitControls.ts` (modify) — call `onGestureStart()` in
  `onDown` when the FIRST contact lands (`orbitControls.ts:208`, the
  `activePointers.size === 1` branch); call `onGestureEnd()` in `onUp` when
  `activePointers.size === 0` (`orbitControls.ts:259`). Rename the five
  `options?.onCameraChange?.()` calls (`orbitControls.ts:247,336,413,446,483`) to
  `onChange`. The orbit/pan/zoom MATH is untouched (spec §3, §5).
- `src/services/engine/phases/wireInput.ts` (modify) — wire the hooks at the
  `attachOrbitControls` call (`wireInput.ts:248`): `onGestureStart` →
  `seedFromBase(state.cam, store.getState().camera.base)` + `dispatch(beginDrag())` +
  `dispatch(cancelCameraTween())`; `onGestureEnd` → `dispatch(endDrag())`; `onChange`
  → `scheduler.requestRender()`.
- `src/services/camera/seedCameraFromBase.ts` (create, `utils`-style single fn) —
  `seedCameraFromBase(cam: OrbitCamera, base: CameraPose): void` copies base's
  target/yaw/pitch/distance onto `cam` + `updatePosition` (spec §3 `seedFromBase`).
- `tests/services/camera/orbitControls.test.ts` (modify) — gesture-hook firing.

**Interfaces:** `pose` for `orbitDrag` reads `state.cam` (now seeded from `base` on
grab, mutated by the existing orbit/pan/zoom math during the gesture, committed back
to `base` on release via the engine's commit-on-edge). The state-saturating pitch /
distance clamps STAY where `state.cam` is mutated (`PITCH_LIMIT`,
`orbitControls.ts:440`; `clampDistance`, `:333,481`) — spec §2 "clamps split by kind"
keeps the integrator clamps with the integrator (do NOT move them to a read edge).

- [ ] `onGestureStart fires on first pointerdown, onGestureEnd on last pointerup`
  (typed `vi.fn<() => void>()` spies; multi-pointer: end fires only when all lift).
- [ ] `onChange fires after each orbit/pan/zoom mutation` (rename coverage).
- [ ] `seedCameraFromBase copies the four orbit params + recomputes position`.
- [ ] **Open item 4 verification:** grep `cam.yaw|cam.pitch|cam.distance|cam.target`
  outside `orbitControls`/`cameraTween`/drivers → record zero non-driver camera
  writers (no SpaceMouse/raw input writer to route). State the result in the commit
  body.
- [ ] Confirm fail → implement → pass. `npm test -- orbitControls` + full suite →
  green. Commit.

### Task 4.2 — `orbitDrag` activation: `dragging` now wins priority 80

**Files:**
- `src/services/engine/frame/runFrame.ts` / `frameContext.ts` — no code change beyond
  what Phase 2/3 landed; this task is the INTEGRATION assert that with `dragging`
  true, `orbitDrag` (80) wins and its pose is `state.cam`, and on `endDrag` the
  engine commits `state.cam`'s pose into `base`.
- `tests/services/engine/camera/` — a drag-lifecycle test (begin→move→end).

- [ ] `while dragging, the produced pose is state.cam (orbitDrag wins)`.
- [ ] `on endDrag, commitCameraPose folds the gesture's final pose into base` (one
  dispatch, spec §6 no-jump invariant — the next resting frame returns that base).
- [ ] `grab mid-tween: beginDrag makes orbitDrag win and the displaced tween commits its last pose`
  (spec §1 "A grab mid-animation").
- [ ] Confirm fail → implement → pass. `npm test` + `npm run typecheck` → green.
  Commit.

### Task 4.3 — generalize `watchWake` to `WAKE_ROUTES`

**Files:**
- `src/store/effects/reconcileSagas.ts` (modify) — replace `isSettingsWrite`
  (`reconcileSagas.ts:73-74`) with a `WAKE_ROUTES` set matcher (spec §4):

```ts
const WAKE_ROUTES = new Set<string>([settingsRoute, cameraRoute]);
const isWakeWrite = (a: Action): boolean =>
  typeof a.type === 'string' && WAKE_ROUTES.has(a.type.split('/')[0]!);
```

  Update `watchWake`'s `takeEvery(isSettingsWrite, …)` → `takeEvery(isWakeWrite, …)`.
  Update the module header's `watchWake` paragraph: wake-on-scene-write is not a
  settings-specific concern; `WAKE_ROUTES` is the registry of routes whose writes
  affect the drawn scene (settings + camera, and selection when it lands). NO parallel
  `watchCameraWake` (spec §4 — generalize, don't duplicate).
- `tests/store/effects/reconcileSagas.test.ts` (modify) — add camera-route coverage.

- [ ] `a camera slice write (beginDrag / startCameraTween / setAutoRotate) wakes the loop`
  — dispatch a `camera/*` action, assert `requestRender` called.
- [ ] `a settings write still wakes the loop` (regression — existing case still
  passes).
- [ ] `an unrelated route (tier / ui) does NOT wake via watchWake` (the set is
  exactly settings+camera).
- [ ] Confirm fail → implement → pass. `npm test -- reconcileSagas` + full suite →
  green. Commit.

---

## Phase 5 — Trim

Mirrors spec §8.5. Delete `tweenManager` + wiring; relocate `autoRotate` out of
settings; flip the App toggle; delete the `onCameraChange` option; freeze the
surviving surface.

### Task 5.1 — App auto-rotate toggle → camera-slice `setAutoRotate`; relocate out of settings

**Files:**
- `src/components/App/App.tsx` (modify) — import `setAutoRotate` + `selectAutoRotate`
  from the CAMERA slice (`../../state/camera/...`) instead of settings (`App.tsx:75`
  import, `:138` selector, `:483` dispatch). The toggle dispatches
  `dispatch(setAutoRotate({ active: !autoRotate, rate: <the rate constant> }))` — note
  the payload is now `{ active, rate }`, not a bare boolean.
- `src/state/settings/settingsSlice.ts` (modify) — remove the `setAutoRotate` reducer
  (`settingsSlice.ts:90-93`) + its export (`:204`) + the `camera` sub-object from the
  slice.
- `src/state/settings/initialState.ts` (modify) — remove the `camera: { autoRotate }`
  block (`initialState.ts:70-72`).
- `src/state/settings/selectors.ts` (modify) — remove the old `selectAutoRotate`
  (`selectors.ts:84-85`) + the camera-cluster comment.
- `src/@types/settings/...` — drop the `camera` field from the settings state type.
- `tests/` — repoint any settings test asserting `settings.camera.autoRotate` onto
  the camera slice; the App toggle test asserts the camera-slice dispatch.

> **`rate` payload.** The App toggle now carries `{ active, rate }`. The `rate`
> constant (the old `AUTO_ROTATE_YAW_DELTA`) should live in ONE place — keep it in the
> camera slice's initial state and have the toggle dispatch `{ active: next, rate:
> selectCameraIntent(state).autoRotate.rate }` (reuse the existing rate, don't
> re-literal it at the call site — single source of truth).

- [ ] `the auto-rotate toggle dispatches camera/setAutoRotate with the active bit flipped and the existing rate`.
- [ ] `settings slice no longer has a camera sub-object` (settings state shape pin).
- [ ] Confirm fail → implement → pass. `npm test` + `npm run typecheck` → green.
  Commit.

### Task 5.2 — delete `tweenManager` + `createTweenManager` wiring

**Files (delete):**
- `src/services/engine/camera/tweenManager.ts`.
- `src/@types/camera/TweenManager.d.ts`.
- `src/@types/camera/CameraTween.d.ts` (superseded by `CameraTweenDescriptor` —
  confirm no remaining importer first; `advanceCameraTween` / `cameraTween.ts` may
  still reference it — see below).

**Files (modify):**
- `src/services/engine/engine.ts` — remove the `createTweenManager` import
  (`engine.ts:78`), the `tweens:` construction (`engine.ts:280-282`), the
  `state.subsystems.tweens.destroy()` teardown (`engine.ts:618`), and the `tweens`
  field from `EngineState.subsystems` type. Drop the stale `tweens`-mentioning
  comments (`engine.ts:150,274-279`).
- `src/services/camera/cameraTween.ts` — `advanceCameraTween` is now dead (its math
  moved to `evaluateTween`). DELETE it + `cameraTween.ts` if no importer remains
  (confirm via search — Task 1.4 reused the math, not the function). Keep the shared
  `easeOutCubic`/`lerp`/`lerpAngleShortest` utils.
- `src/@types/engine/state/EngineState.d.ts` (or wherever `subsystems.tweens` is
  typed) — remove `tweens`.

**Interfaces:** After this task no `createTweenManager` / `TweenManager` /
`CameraTween` / `advanceCameraTween` import remains. Confirm via search.

- [ ] Search for residual importers of each deleted symbol → zero.
- [ ] Delete the files; remove the engine wiring + type field.
- [ ] `npm run typecheck` (catches dangling imports) + `npm test` → green. Commit.

### Task 5.3 — delete `OrbitControlsOptions.onCameraChange`; freeze the surface

**Files:**
- `src/@types/camera/OrbitControlsOptions.d.ts` (modify) — remove `onCameraChange?`
  (`OrbitControlsOptions.d.ts:40-53`) now that every call site uses `onChange`
  (Task 4.1).
- `src/services/camera/orbitControls.ts` — confirm no `onCameraChange` reference
  remains (all renamed in 4.1).
- `src/services/engine/phases/wireInput.ts` — confirm the call uses `onChange`.
- `tests/` — a freeze/shape test for the surviving camera surface: the slice has
  exactly `{ base, tween, autoRotate, dragging }`; `CameraTweenDescriptor` is
  clock-free; the engine subsystems no longer carry `tweens`.

- [ ] Remove the option; assert no residual `onCameraChange` (grep → zero).
- [ ] `the camera slice surface is frozen to base/tween/autoRotate/dragging`.
- [ ] `npm run typecheck` + `npm test` → green. Commit.

---

## Phase 6 — Quality gates + tie-off

### Task 6.1 — entanglement-radar over the final diff

**Files:** none (review pass; capture findings inline if any).

- [ ] Run the `entanglement-radar` skill over the full branch diff.
- [ ] **Verify the spec's un-braided choices held:**
  - **Single home for the resting pose** — `base` is the ONLY place the committed
    pose lives; no second copy (no mirror of `base` on the engine, no `state.cam`
    read as truth between gestures). `state.cam` is transient drag scratch only.
  - **Driver table stayed a data registry** (spec §1, §5; simplicity.md §7) — the
    four rows are data with `priority`/`isActive`/`pose`; NO per-type `if`/`switch`
    on driver id in the resolver, NO `enter`/`exit` growth on `CameraDriver` (the
    Task 3.1 pin holds).
  - **Clamps split by kind stayed split** (spec §2) — pitch/distance state-saturating
    clamps live with the integrator (`orbitControls` + `commitCameraPose` payload),
    NOT at a read edge; no clamp migrated to the other kind's home.
  - **No wall-clock in the store** (spec §2, §6) — the slice carries no `startMs` /
    `Date.now()`; the clock is the engine `CameraClock` Resource.
  - **No mirror of the pose** (spec §4) — the produced pose is read where it's
    produced (`deriveFrameContext` → `vp`); no `store.subscribe`, no per-frame pose
    dispatch, no renderer-side copy.
  - **Wake centralized** — one `WAKE_ROUTES` matcher, not a parallel
    `watchCameraWake` (spec §4).
- [ ] Address any finding (or record as a follow-up if out of scope), re-run affected
  tests, commit.

### Task 6.2 — final verification + handoff

> Run by the MAIN thread (not the implementer subagent): the implementer can't run
> npm.

- [ ] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] `npm test` (full suite) → green; count ≥ the baseline minus legitimately
  removed tween-manager tests plus the new slice/driver/clock/saga tests. Confirm no
  net coverage loss for the moved behaviour (tween math now in `evaluateTween`, drag
  wake now in `watchWake`).
- [ ] Grep the tree for residual references to deleted symbols (`createTweenManager`,
  `TweenManager`, `advanceCameraTween`, `CameraTween`, `onCameraChange`,
  `settings.camera`) → zero hits.
- [ ] DoD checklist: (a) `camera` slice holds Intent only — no projection, no
  `position`, no wall-clock; (b) the pose is produced by the driver table and never
  stored/mirrored; (c) one `commitCameraPose` dispatch per deactivation edge, never
  per frame; (d) no visible motion change (the bridge guaranteed frame-identical
  output at every step); (e) the four open items are resolved as planned.
- [ ] Run the `superpowers:finishing-a-development-branch` handoff: present
  merge/PR/cleanup options (branch + PR, squash-merge).
