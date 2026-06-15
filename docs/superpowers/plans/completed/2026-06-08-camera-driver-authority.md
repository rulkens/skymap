# Camera-driver authority — implementation plan

> **REQUIRED SUB-SKILL:** execute this plan with `superpowers:subagent-driven-development`
> (fresh implementer subagent per task + spec + quality reviews). Each implementer
> EDITS FILES ONLY; the **main thread** runs `npm test` / `npm run typecheck` and
> commits. Dispatch implementers with `run_in_background: true`.

## Goal

Establish a single per-frame camera-control authority. Replace the implicit
call-order + ad-hoc guards in `runFrame.ts`'s per-frame camera-mutation block
(`tweens.advance` → `spaceMouse.applyToCamera` → guarded auto-rotate) with a
**driver registry + one resolver** that writes `state.cam` exactly once. Precedence
becomes data (`priority`), and the resolver also answers "is the camera animating?"
for the render-on-demand gate.

This is **behaviour-preserving**. The `tour` driver (priority 80) is added LATER
by the tour plan — this plan stops at three drivers (`input` 100, `tween` 60,
`autoRotate` 20). Every task reproduces current behaviour as a test FIRST, then
refactors green.

Source of truth: `docs/superpowers/specs/2026-06-08-pre-tour-decomplection-design.md`
section "1. Camera-driver authority".

## Architecture

The un-braided shape (from the spec):

```
runFrame.ts (one camera-write site)
  └─ runCameraDrivers(drivers, state.cam, nowMs)   ← pure resolver
        picks the single highest-priority active driver, calls its apply()

drivers: readonly CameraDriver[]   (built in startLoop, carried on RunFrameDeps)
  ├─ input      (100)  wraps spaceMouse:  isActive=hasAxes,   apply=applyToCamera
  ├─ tween      (60)   wraps tweenManager: isActive=isActive, apply=advance
  └─ autoRotate (20)   isActive=settings.camera.autoRotate,   apply=yaw increment
        (tour (80) added later by the tour plan — NOT here)
```

Cancellation is unchanged and is the real interrupt mechanism: the SpaceMouse
subsystem still calls its `cancelTween` callback when the puck deflects
(`spaceMouseSubsystem.ts:204`); mouse-drag still cancels via its existing path.
The registry only resolves the **same-frame race** between active drivers. The
auto-rotate `!tweens.isActive()` guard is **deleted** — auto-rotate is just lower
priority.

The RoD `stillAnimating` predicate's three camera terms
(`settings.camera.autoRotate`, `tweens.isActive()`, `spaceMouse.hasAxes()`)
collapse to `drivers.some(d => d.isActive(nowMs))`. The non-camera terms stay.

### Skymap conventions reminder (these override defaults)

- **`type` aliases, never `interface`.** One exported type per file under
  `src/@types`. Filename = export name.
- **Readonly + values.** `readonly` fields; pure functions; no mirror state.
- **`Vec3` alias, never raw tuples** (not needed for the new types here, but the
  rule stands if you touch camera math).
- **Didactic comments.** Multi-paragraph module headers explaining _why_ and
  _what the alternative was_ — match the style of `tweenManager.ts` /
  `spaceMouseSubsystem.ts`. Comments are timeless: no dates, no PR refs, no
  "pre-X" history.
- **No `git add -A`/`.`** — stage specific paths. Branch + PR; squash-merge.
- **Re-verify every cited `file:line`** before editing — line numbers drift.
- **Behaviour-preserving:** "green before and after" is the gate. Write the
  current-behaviour test FIRST, watch it pass against the OLD code, THEN refactor
  and watch it stay green. (For the resolver's own brand-new unit tests, the
  red→green order is the usual TDD: test fails because the module doesn't exist,
  then passes.)

### Verified current-tree facts (re-verify line numbers; they drift)

- Per-frame camera mutation block: `src/services/engine/frame/runFrame.ts`
  ~138-170 — `state.subsystems.tweens.advance(state.cam, performance.now())`
  (~138-140); `state.subsystems.spaceMouse.applyToCamera(state.cam, performance.now())`
  (~151-153); auto-rotate yaw `if (state.settings.camera.autoRotate && state.cam && !state.subsystems.tweens.isActive()) { state.cam.yaw += 0.000873; updatePosition(state.cam); }`
  (~167-170).
- RoD `stillAnimating`: `runFrame.ts` ~493-501 — disjunction. Camera terms:
  `state.settings.camera.autoRotate`, `state.subsystems.tweens.isActive()`,
  `state.subsystems.spaceMouse.hasAxes()`. Non-camera terms (KEEP):
  `(ready && state.subsystems.texturedDisks.hasInFlightWork())`,
  `state.subsystems.fades.isAnyAnimating(nowMs)`,
  `state.subsystems.structureFocus.isAwake(nowMs)`,
  `state.gpu.flowFieldRenderer?.isAnimating(state.settings.flow) === true`.
- `TweenManager`: `src/@types/camera/TweenManager.d.ts`; factory
  `src/services/engine/camera/tweenManager.ts:52`. Methods: `start`, `cancel`,
  `isActive(): boolean`, `advance(cam, nowMs): boolean`, `destroy`.
- `advanceCameraTween` (the lerp): `src/services/camera/cameraTween.ts:69` — calls
  `updatePosition` internally; does NOT tween fov/near/far.
- SpaceMouse subsystem: `src/services/engine/subsystems/spaceMouseSubsystem.ts`;
  type `src/@types/engine/subsystems/SpaceMouseSubsystem.d.ts`. Methods include
  `hasAxes(): boolean` (`:187`) and `applyToCamera(cam, nowMs): void` (`:190`).
  `applyToCamera` calls `cancelTween()` (`:204`) when axes are non-zero — that is
  the input-interrupts-animation mechanism. KEEP IT.
- OrbitControls: `src/services/camera/orbitControls.ts` — mutates `state.cam` on
  pointer events OUTSIDE the frame loop; reports via `OrbitControlsOptions.onCameraChange`
  (`src/@types/camera/OrbitControlsOptions.d.ts:53`). It is NOT a per-frame driver
  and is NOT touched by this plan. (Its tween-cancel-on-grab wiring lives in
  engine.ts's input wiring — leave it as-is.)
- `OrbitCamera`: `src/@types/camera/OrbitCamera.d.ts`. Import path from the new
  driver type: `'../../../camera/OrbitCamera'` (see Task 1 for the exact relative
  depth from `src/@types/engine/camera/`).
- `updatePosition`: `src/services/camera/orbitCamera.ts` (imported in `runFrame.ts:40`
  as `import { updatePosition } from '../../camera/orbitCamera'`).
- `state.settings.camera.autoRotate`: `boolean`
  (`src/@types/settings/EngineSettingsState.d.ts:86-87`).
- `EngineSubsystemHandles`: `src/@types/engine/handles/EngineSubsystemHandles.d.ts`
  — has `tweens: TweenManager`, `spaceMouse: SpaceMouseSubsystem`.
- `RunFrameDeps`: `src/@types/engine/frame/RunFrameDeps.d.ts`; assembled in
  `src/services/engine/phases/startLoop.ts:115-131`; consumed in `runFrame.ts:64`.
- Engine subsystem construction: `src/services/engine/engine.ts:569` (`tweens`),
  `:575` (`spaceMouse`). The driver list's home is decided in Task 3 (built in
  `startLoop`, carried on `RunFrameDeps` — see that task's rationale).
- No existing `CameraDriver` / `cameraDrivers` / `drivers` symbol in `src/`
  (verified). This is greenfield for the type + resolver.

---

## Task 1: `CameraDriver` type

**Files:**
- Create `src/@types/engine/camera/CameraDriver.d.ts`

**Contract:**

```ts
import type { OrbitCamera } from '../../../camera/OrbitCamera';

export type CameraDriver = {
  readonly id: string;        // 'input' | 'tween' | 'autoRotate' (tour added later)
  readonly priority: number;  // input 100 > tour 80 > tween 60 > autoRotate 20
  isActive(nowMs: number): boolean;        // wants to write state.cam this frame
  apply(cam: OrbitCamera, nowMs: number): void;
};
```

- [x] Verify the `OrbitCamera` import resolves: from
  `src/@types/engine/camera/CameraDriver.d.ts`, the path to
  `src/@types/camera/OrbitCamera.d.ts` is `'../../../camera/OrbitCamera'`
  (`engine/camera/` → up 3 → `@types/` → `camera/OrbitCamera`). Confirm against
  the live tree before committing.
- [x] Write the type exactly as above, with a didactic module header explaining:
  the type is the seam that makes camera precedence **data** instead of call
  order; `id` is for debugging/identity, `priority` orders the resolver, `isActive`
  answers both "should I write this frame" and (collectively) "is the camera
  animating" for the RoD gate; `apply` is the single mutation each driver performs.
- [x] Main thread: `npm run typecheck` passes (no consumer yet — this just proves
  the import path).
- [x] Commit.

---

## Task 2: `runCameraDrivers` resolver (pure)

**Files:**
- Create `src/services/engine/camera/cameraDrivers.ts`
- Create `tests/services/engine/camera/cameraDrivers.test.ts`

**Signature:**
`runCameraDrivers(drivers: readonly CameraDriver[], cam: OrbitCamera, nowMs: number): void`

**Behaviour:** filter `drivers` to those with `isActive(nowMs) === true`, select the
single highest-`priority` one, call its `apply(cam, nowMs)`. If none active, write
nothing (no `apply` call). Pure over the driver list — no captured state, no I/O.
(`OrbitCamera` is only forwarded to `apply`; the resolver never reads or mutates
`cam` itself, so the tests can pass a trivial cam stub.)

**Tests** (TDD red→green; fake drivers, `cam` is a throwaway stub):

- [x] `runCameraDrivers calls the single highest-priority active driver` — two
  active drivers (priority 60 + 20); assert the priority-60 driver's `apply` was
  called once and the priority-20 driver's `apply` was NOT called.
- [x] `runCameraDrivers ignores inactive higher-priority drivers` — priority-100
  driver `isActive=false`, priority-20 driver `isActive=true`; assert the
  priority-20 `apply` is called (an inactive higher driver does not block a lower
  active one).
- [x] `runCameraDrivers writes nothing when no driver is active` — all drivers
  `isActive=false`; assert no `apply` is called on any driver.
- [x] `runCameraDrivers forwards cam and nowMs to apply` — assert the active
  driver's `apply` received the exact `cam` reference and `nowMs` value passed in.
- [x] Run the suite (`npm test -- cameraDrivers`) — fails (module absent).
- [x] Implement `runCameraDrivers` with a didactic header: this is the ONE
  camera-write site; single-writer arbitration (no cooperative blending — the spec
  bakes that in); precedence is data. Note it does not sort-mutate the input array
  (treat `drivers` as readonly).
- [x] Main thread: `npm test -- cameraDrivers` → all pass; `npm run typecheck`.
- [x] Commit.

---

## Task 3: Wrapper drivers + driver list in `startLoop`, carried on `RunFrameDeps`

**Decision — where the list lives:** build the `drivers` array in
`startLoop.ts` (where `state.subsystems` and `state.settings` are all in scope)
and carry it on `RunFrameDeps` as `readonly drivers: readonly CameraDriver[]`.
Rationale: `RunFrameDeps` already exists to carry per-frame closure captures
assembled once at loop start (`startLoop.ts:115`); the drivers are exactly that.
Putting them on `EngineState` would widen the state contract for one consumer
(runFrame) and invite mirror-state. The wrapper drivers close over
`state.subsystems.{spaceMouse,tweens}` and `state` (for `settings.camera.autoRotate`),
so the closures stay live as settings change.

**Files:**
- Modify `src/@types/engine/frame/RunFrameDeps.d.ts` (add `drivers` field)
- Modify `src/services/engine/phases/startLoop.ts` (build the three wrapper drivers
  + the `drivers` array; add to `frameDeps`)
- Create `tests/services/engine/camera/cameraDriverWrappers.test.ts` (wrapper
  `isActive`/`apply` mapping)

**Contract — `RunFrameDeps` addition:**
```ts
import type { CameraDriver } from '../camera/CameraDriver';
// ...
/**
 * Camera-control drivers, highest priority first is NOT assumed — the
 * resolver sorts by `priority`. Built once at loop start; the resolver
 * (`runCameraDrivers`) picks the single active winner each frame and is
 * also the source of truth for "is the camera animating" (RoD gate).
 */
readonly drivers: readonly CameraDriver[];
```

**Wrapper drivers** (constructed inline in `startLoop`, closing over `state`):
- `input` — `{ id: 'input', priority: 100, isActive: () => state.subsystems.spaceMouse.hasAxes(), apply: (cam, nowMs) => state.subsystems.spaceMouse.applyToCamera(cam, nowMs) }`
- `tween` — `{ id: 'tween', priority: 60, isActive: () => state.subsystems.tweens.isActive(), apply: (cam, nowMs) => { state.subsystems.tweens.advance(cam, nowMs); } }`
- `autoRotate` — `{ id: 'autoRotate', priority: 20, isActive: () => state.settings.camera.autoRotate, apply: (cam) => { cam.yaw += 0.000873; updatePosition(cam); } }`

(The implementer writes the bodies; the above pins the contract — `isActive`
predicates, the yaw delta `0.000873`, and that `autoRotate.apply` calls
`updatePosition`. Import `updatePosition` from `../../camera/orbitCamera` in
`startLoop.ts` — verify the relative path from `src/services/engine/phases/`.)

> **Note on `nowMs` vs `performance.now()`:** today `tweens.advance` and
> `spaceMouse.applyToCamera` are called with `performance.now()` inline
> (`runFrame.ts:139,152`), while the auto-rotate block reads no time. After this
> refactor the resolver is called with `runFrame`'s `nowMs` parameter (the value
> `startLoop` passes as `performance.now()` at the call site,
> `startLoop.ts:143`). These are the same wall-clock source, so behaviour is
> preserved. Use the `nowMs` the resolver receives — do NOT re-read
> `performance.now()` inside the wrappers.

**Tests** (wrapper mapping — each wrapper's predicate maps to its underlying piece):

- [x] `input driver isActive reflects spaceMouse.hasAxes` — fake spaceMouse with
  toggleable `hasAxes`; assert the driver's `isActive` returns the same boolean
  both ways.
- [x] `input driver apply forwards to spaceMouse.applyToCamera` — assert the fake's
  `applyToCamera` was called with the cam + nowMs.
- [x] `tween driver isActive reflects tweenManager.isActive` — fake tween manager;
  assert both booleans.
- [x] `tween driver apply forwards to tweenManager.advance` — assert `advance`
  called with cam + nowMs.
- [x] `autoRotate driver isActive reflects settings.camera.autoRotate` — flip the
  setting; assert the boolean tracks it.
- [x] `autoRotate driver apply increments yaw and updates position` — assert
  `cam.yaw` increased by `0.000873` and `updatePosition` ran (spy or assert
  `position` recompute via a real-ish cam stub).

> **How to test the wrappers in isolation:** the wrappers are currently inline in
> `startLoop`. To unit-test them without booting the engine, extract a small pure
> builder `buildCameraDrivers(state): readonly CameraDriver[]` co-located in
> `cameraDrivers.ts` (the module from Task 2), taking the slices it needs
> (`state.subsystems.spaceMouse`, `state.subsystems.tweens`, and a
> `() => state.settings.camera.autoRotate` getter — or just `state`). `startLoop`
> then calls `buildCameraDrivers(state)`. This keeps the wrapper logic pure and
> testable and keeps `startLoop` a thin assembler. Decide the exact argument shape
> when you read the live `EngineState`; prefer passing `state` and reading the
> slices inside, matching how other subsystems close over `state`.

- [x] Run the wrapper suite — fails (builder absent).
- [x] Implement `buildCameraDrivers` in `cameraDrivers.ts`; wire `startLoop` to
  call it and put the result on `frameDeps.drivers`; add the `drivers` field to
  `RunFrameDeps.d.ts`.
- [x] Main thread: `npm test -- cameraDriver` (resolver + wrappers); `npm run typecheck`.
- [x] Commit.

---

## Task 4: Rewrite `runFrame`'s camera block + RoD gate (the behaviour-preserving swap)

**Files:**
- Modify `src/services/engine/frame/runFrame.ts`
- Modify `tests/services/engine/frame/runFrame.test.ts` (add regression tests)

**The two edits:**

1. Replace `runFrame.ts` ~138-170 (the three `if (state.cam) { … }` blocks for
   tween-advance, spaceMouse-apply, and the guarded auto-rotate) with a single
   guarded resolver call:
   ```ts
   if (state.cam) {
     runCameraDrivers(deps.drivers, state.cam, nowMs);
   }
   ```
   - The `!state.subsystems.tweens.isActive()` guard on auto-rotate is **DELETED**
     — auto-rotate's lower priority now encodes "tween wins". Carry over the
     didactic comment, rewritten to explain the driver-precedence model (cite the
     spec). Remove the now-stale per-block comments about call order.
   - Import `runCameraDrivers` from `../camera/cameraDrivers` (verify relative path
     from `src/services/engine/frame/`).

2. Replace the **camera terms only** of the `stillAnimating` disjunction
   (`runFrame.ts` ~493-501) — `state.settings.camera.autoRotate`,
   `state.subsystems.tweens.isActive()`, `state.subsystems.spaceMouse.hasAxes()`
   — with `deps.drivers.some((d) => d.isActive(nowMs))`. KEEP the non-camera terms
   exactly (`texturedDisks.hasInFlightWork()` with its `ready &&` guard,
   `fades.isAnyAnimating(nowMs)`, `structureFocus.isAwake(nowMs)`,
   `flowFieldRenderer?.isAnimating(...)`). Update the predicate-breakdown comment.

**Regression tests** (these encode CURRENT behaviour — write them so they describe
what the existing tree does, then confirm green after the swap). The existing
`runFrame.test.ts` builds a minimal `EngineState` fixture and a `RunFrameDeps`
fixture (`makeState()` at ~line 47); extend those — the new `drivers` field must be
added to the deps fixture (use the real `buildCameraDrivers(state)` so the fixture
exercises the production wiring, or hand-built fake drivers where that's simpler).

- [x] `runFrame: tween active + autoRotate on → tween wins, autoRotate does not nudge yaw`
  — fixture: `state.settings.camera.autoRotate = true`, tween manager `isActive`
  returns true and its `advance` sets cam to a known pose; spaceMouse `hasAxes`
  false. Run `runFrame`. Assert: `tween.advance` was called; `cam.yaw` equals the
  tween's pose (NOT pose + 0.000873) — i.e. auto-rotate did NOT add its delta on
  top. (This is the behaviour the deleted `!tweens.isActive()` guard encoded.)
- [x] `runFrame: idle (no driver active, autoRotate off) → camera holds` — all
  driver predicates false; run `runFrame`; assert `cam.yaw` (and target/distance/
  pitch) are unchanged.
- [x] `runFrame: autoRotate on, nothing else active → yaw advances by 0.000873`
  — only `autoRotate.isActive` true; assert `cam.yaw` increased by exactly the
  delta and `updatePosition` ran. (Confirms the lower-priority driver still fires
  when it is the sole active one.)
- [x] `runFrame: RoD stays awake iff a camera driver is active` — covered by
  equivalence rather than a direct test: the `stillAnimating` tail is reachable
  only on the GPU-ready path (the lightweight fixture early-returns at the
  renderer-null guard), and each driver's `isActive` maps one-to-one onto an old
  term (proven by `cameraDriverWrappers.test.ts`), so `.some(isActive)` IS their
  boolean OR. Documented as a comment in the test file; a heavyweight GPU fixture
  to re-prove the identity would be disproportionate.

> The existing `runFrame.test.ts` mocks `reevaluateDemand` (`:29`). Keep that mock.
> The fixture short-circuits the GPU body via the renderer-null guard
> (`deriveFrameContext` → early return), so the camera block + the RoD tail are
> exercisable without a GPU. Confirm the camera block runs BEFORE the
> `deriveFrameContext` early-return (it does today, `runFrame.ts:138` is above
> `:179`) so these tests reach it. The RoD tail runs only if the body does NOT hit
> an earlier `return` — verify the fixture reaches line ~493 (it must have
> `state.cam` non-null and pass the catalog/hover gates or hit the
> `deriveFrameContext` early-return path which itself `requestRender`s; design the
> RoD assertions around the path the fixture actually takes — read the body
> top-to-bottom against your fixture before asserting).

- [x] Run `npm test -- runFrame` with the NEW tests against the OLD camera block
  first if feasible (to confirm they encode current behaviour); then apply the swap
  and confirm still green. If running against old code first is impractical given
  the resolver dependency, write the tests and the swap together but keep each
  assertion tied to a documented current-behaviour fact above.
- [x] Main thread: `npm test -- runFrame`; full `npm test`; `npm run typecheck`.
- [x] Commit.

---

## Task 5: Entanglement-radar pass + dead-code sweep

**Files:** (review only; small edits if found)
- `src/services/engine/frame/runFrame.ts`
- `src/services/engine/phases/startLoop.ts`
- `src/services/engine/camera/cameraDrivers.ts`

- [x] Run the `entanglement-radar` skill over the diff. Confirm: precedence is now
  data (no `if (source/order)` chain), one camera-write site, the RoD camera terms
  collapsed to the registry, no mirror of the driver list on `EngineState`. — All
  confirmed; the diff IS the un-braid (precedence×statement-order and the duplicated
  "camera is moving" truth both dissolved). No new complecting found.
- [x] Grep for any remaining direct `state.subsystems.tweens.advance` /
  `spaceMouse.applyToCamera` / `cam.yaw += 0.000873` outside the driver wrappers —
  there should be none in `runFrame.ts`. — None; `0.000873` lives only in
  `cameraDrivers.ts` (`AUTO_ROTATE_YAW_DELTA`).
- [x] Confirm the SpaceMouse `cancelTween` mechanism (`spaceMouseSubsystem.ts:204`)
  and the OrbitControls/engine.ts mouse-drag tween-cancel wiring are UNTOUCHED —
  cancellation is the interrupt mechanism; the registry only resolves the
  same-frame race. The spec is explicit about this; do not "simplify" it away. —
  `cancelTween()` at `spaceMouseSubsystem.ts:204` intact; no changes outside the
  four camera files.
- [x] Confirm no fov/near/far behaviour changed (the tween still does not touch
  them; auto-rotate touches only yaw). — Confirmed; auto-rotate touches only `yaw`,
  tween path unchanged.
- [x] Main thread: full `npm test`; `npm run typecheck`. All green. — 2456 tests
  pass; typecheck clean.
- [x] Commit any cleanup. — No code cleanup needed (review found no new knots).

---

## Self-review notes

- **Behaviour preserved?** The three drivers reproduce the exact prior effects:
  spaceMouse-when-deflected (cancels tween, applies axes), tween-when-active
  (advance + auto-clear), auto-rotate-when-on. The only behaviour the OLD code had
  that's now expressed differently is "auto-rotate is suppressed while a tween is
  active" — previously a `!tweens.isActive()` guard, now `priority` ordering
  (tween 60 > autoRotate 20). Task 4's first regression test pins this.
- **Single-writer, no blending.** The resolver calls exactly one `apply`. The spec
  bakes in "no cooperative blending"; if you find yourself wanting two `apply`s in
  one frame, STOP — that's a spec change, escalate.
- **Cancellation untouched.** The registry does NOT replace the cancel-on-input
  interrupt. Input still cancels tween via the existing `cancelTween` callback;
  precedence only resolves the same-frame race. Verify in Task 5.
- **`nowMs` source.** All drivers now receive `runFrame`'s `nowMs` (= the
  `performance.now()` passed at `startLoop.ts:143`), where previously the two
  per-frame mutators each read `performance.now()` inline. Same clock — preserved.
- **Driver list home.** On `RunFrameDeps` (built in `startLoop`), NOT on
  `EngineState` — avoids widening the state contract / mirror state. If a later
  consumer outside `runFrame` needs the list, revisit then; do not pre-emptively
  promote it.
- **Tour is out of scope.** No `tour` driver here. The priority gap (60 < 80 < 100)
  is left deliberately so the tour plan slots its driver in without renumbering.
- **Line numbers drift.** Every `file:line` in this plan was verified against the
  tree on 2026-06-08; re-verify before each edit.
- **Conventions.** One type per `@types` file; `type` not `interface`; readonly
  driver fields; didactic timeless headers; staged paths only; branch + PR +
  squash-merge. npm/typecheck/commits are the MAIN thread's job during
  subagent-driven execution.
