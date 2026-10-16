# Input architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every input source reaches the camera and the picker through source → recognition → binding → actions in
an `input` slice → engine, so the canvas is the first source and the dome remote plugs in later with no engine change.

**Architecture:** A canvas `eventChannel` feeds a generic `inputSourceSaga`, which runs the pure `recognize`, binds
the press through `CONTROL_BINDINGS`, buffers motion to one dispatch per animation frame, and puts `input/*` actions.
The `input` reducer folds them into `pending` steps and pick requests; `runFrame` converts `pending` to today's
`InputStep[]` through one function and dispatches `inputConsumed`; a store-subscribed pick driver answers pick
requests. The aggregator, `attachOrbitControls`, the hover driver, the click resolver and the pointer half of
`inputBindings` are deleted.

**Tech Stack:** TypeScript, Redux Toolkit, redux-saga (`typed-redux-saga`, `eventChannel`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-input-architecture-design.md` (decisions:
`docs/grill-sessions/input-architecture-2026-10-14.md`).

## Global Constraints

- Positions are `UnitPoint`s, 0..1 per axis of the source's own surface, origin top-left. Pixels never leave the
  adapter or the recognizer, except the engine's own `unitToViewPx`.
- `dx` is a fraction of the source's width, `dy` of its height.
- Nothing outside `src/services/engine/` calls into the engine; sources only dispatch actions.
- `InputStep` and every file that consumes it (`replayInput.ts`, `applyInputToCamera.ts`, `surfaceStep.ts`,
  `steppedSitePose.ts`, `latchSurfaceGesture.ts`, …) do not change.
- **`driverGoldenTrace.test.ts` passes unmodified.** Never re-record it (`DRIVER_GOLDEN_RECORD=1`) in this branch.
- iOS: never call `setPointerCapture` (the comment at `orbitControls.ts:139-145` travels with the listeners).
- Moves and renames go through `npm run move-files -- <from> <to>`, never `git mv`.
- Every new or moved helper is one symbol per file (`utils/`, `@types/`, `data/`); types live in `@types/`, never
  inline.
- Briefs say `npx prettier --write <files>`, never `npm run format`.

## Review Focus

1. **Double-click focus fly survives (the B1 landmine).** Today `wireInput.ts:194-204` dispatches `beginDrag` +
   `cancelCameraTween` at DOM time so a double-click's focus tween is not cancelled by its own second press. The new
   order must keep it: the second press's `inputGestureStarted` reaches the store before the double-tap's
   `focusSelected`. Pinned by Task 6's integration test.
2. **Wheel during a follow or a fly-to keeps today's lane.** A notch with no pointer down is `held: false`, commits
   per notch, and must not cancel a tween or set `dragging`. A notch while the same source holds a gesture is
   `held: true` and folds into the gesture. Pinned in Tasks 3 and 4.
3. **A tap during an in-flight hover pick must still select.** `pickProgram.pick` resolves `null` for a second call
   while one is in flight (`clickHandler.ts:24-27`), which today can silently deselect. The pick driver serialises
   both requests through one in-flight gate, so the select fires once the hover pick settles. Pinned in Task 5.
4. **Mouse released outside the window.** With no pointer capture, no `pointerup` arrives; the next `pointerdown` from
   a mouse must heal the stale state rather than start a pinch (`orbitControls.ts:43-55`). Pinned in Task 1.
5. **Right-click then left-click on the same spot is not a double-tap.** Double-tap needs the same button and pointer
   type as the previous tap, and the saga reports taps only for presses bound to `orbit`. Pinned in Tasks 1 and 6.

---

### Task 1: Device and gesture types, input constants, and the pure recognizer

**Files:**
- Create: `src/@types/input/UnitPoint.d.ts`, `Modifiers.d.ts`, `DeviceEvent.d.ts`, `Gesture.d.ts`, `Press.d.ts`,
  `RecognizerState.d.ts`
- Create: `src/data/input/tapSlopPx.ts`, `doubleTapMs.ts`, `doubleTapSlopPx.ts`
- Move: `WHEEL_ZOOM_K` out of `src/services/engine/subsystems/inputAggregator.ts:16-24` into
  `src/data/input/wheelZoomK.ts` (with its doc comment); update the import in `src/data/camera/orientDecay.ts:8`.
  `inputAggregator.ts` imports it from there until Task 4 deletes the aggregator.
- Create: `src/utils/input/initialRecognizerState.ts`, `src/utils/input/recognize.ts`
- Test: `tests/utils/input/recognize.test.ts`
- Move: `docs/superpowers/plans/2026-10-12-dome-remote-prep.md` → `docs/superpowers/plans/completed/` (the shipped
  prep plan, #888; doc move, so plain `git mv` is fine here).

**Interfaces:**
- Produces (exact, from the spec):

```ts
export type UnitPoint = { readonly x: number; readonly y: number };
export type Modifiers = { readonly shift: boolean; readonly ctrl: boolean; readonly alt: boolean; readonly meta: boolean };
export type DeviceEvent = { readonly t: number } & (
  | { readonly kind: 'down' | 'move' | 'up' | 'cancel'; readonly pointer: number;
      readonly pointerType: 'mouse' | 'touch' | 'pen'; readonly button: 0 | 1 | 2;
      readonly at: UnitPoint; readonly mods: Modifiers }
  | { readonly kind: 'wheel'; readonly ratio: number; readonly at: UnitPoint; readonly mods: Modifiers }
  | { readonly kind: 'leave' }
  | { readonly kind: 'resize'; readonly widthPx: number; readonly heightPx: number }
);
export type Press = { readonly button: 0 | 1 | 2; readonly pointerType: 'mouse' | 'touch' | 'pen' } & Modifiers;
export type Gesture =
  | { readonly kind: 'heldStart'; readonly press: Press; readonly at: UnitPoint }
  | { readonly kind: 'drag'; readonly dx: number; readonly dy: number; readonly at: UnitPoint }
  | { readonly kind: 'pinch'; readonly ratio: number }
  | { readonly kind: 'heldEnd' }
  | { readonly kind: 'wheel'; readonly ratio: number; readonly at: UnitPoint; readonly mods: Modifiers }
  | { readonly kind: 'hover'; readonly at: UnitPoint | null }
  | { readonly kind: 'tap'; readonly press: Press; readonly at: UnitPoint }
  | { readonly kind: 'doubleTap'; readonly press: Press; readonly at: UnitPoint };

export const TAP_SLOP_PX = 4;          // today's click threshold, orbitControls.ts:38-41
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 16;

export function initialRecognizerState(): RecognizerState;
export function recognize(state: RecognizerState, event: DeviceEvent):
  { readonly state: RecognizerState; readonly gestures: readonly Gesture[] };
```

`tap` and `doubleTap` carry the `press` (a plan-time addition to the spec's shape) so the saga can drop taps from
presses not bound to `orbit` (Task 6). `RecognizerState` is the implementer's shape, all `readonly`; it holds the
surface size in px (0 × 0 until the first `resize`), the pressed pointers with their latest `UnitPoint`, the open
held press and its driving pointer, whether the gesture became a pinch, the pinch span, the press point, and the
last tap (`t`, `at`, `press`).

**Rules** (carried from `src/services/camera/orbitControls.ts`, which this replaces in Task 6):

- `resize` stores the size and emits nothing.
- A mouse `down` first clears every pressed pointer and any open press (`orbitControls.ts:43-55`); touch and pen do
  not.
- First `down` with no pointer pressed → `heldStart { press, at }`. A second `down` makes the gesture a pinch and
  emits nothing. A third changes nothing.
- `move` of the driving pointer in a non-pinch gesture → `drag { dx, dy, at }`, with `dx`/`dy` the change since its
  last point in unit values. A `move` of any other pointer only updates its stored point.
- Pinch: each `move` of either of the first two pointers → `pinch { ratio: oldSpan / newSpan }`, the span measured in
  pixels (unit deltas × surface size, so the aspect is applied). A zero span emits nothing.
- Pinch broken (one of two lifts): no more motion; the survivor drives nothing until it lifts.
- Last pointer `up` → `heldEnd`, then `tap` when the gesture never became a pinch and the release lies within
  `TAP_SLOP_PX` (pixels, squared compare) of the press point. A `tap` within `DOUBLE_TAP_MS` (event `t`) and
  `DOUBLE_TAP_SLOP_PX` of the previous tap, with the same `button` and `pointerType`, is followed by `doubleTap`, and
  the remembered tap clears (a third tap is a new first tap).
- `cancel` of a pressed pointer → as `up` for the gesture's bookkeeping, but never a tap.
- `up`/`cancel` of an unknown pointer → nothing.
- Mouse `move` with no pointer pressed → `hover { at }`. Touch and pen never hover. `leave` → `hover { at: null }`.
- `wheel` → one `wheel` gesture, always, pressed or not.

Tests: `recognize.test.ts` drives `recognize` with literal `DeviceEvent` arrays through a small local `run(events)`
fold. Use a 200 × 100 surface (aspect 2) so aspect bugs show.

- [ ] Move the prep plan to `completed/`; move `WHEEL_ZOOM_K` and fix its two importers.
- [ ] Add the types and constants.
- [ ] Write these tests, each with its assertion on the emitted `Gesture[]`:
  - `a press then a release within the slop is heldStart, heldEnd, tap`
  - `a release beyond the slop is heldStart, heldEnd with no tap`
  - `two taps inside the window and the distance add a doubleTap after the second tap`
  - `a second tap after DOUBLE_TAP_MS is a plain tap`
  - `a second tap beyond DOUBLE_TAP_SLOP_PX is a plain tap`
  - `a right-click tap then a left-click tap on the same spot is not a doubleTap`
  - `a third quick tap starts a new pair: tap, tap+doubleTap, tap`
  - `only the first contact emits heldStart; a second contact emits nothing`
  - `a pinch on a 2:1 surface reports old span over new span in pixels` (spread horizontally by 0.1 unit vs
    vertically by 0.1 unit gives different ratios)
  - `lifting one of two pinch fingers leaves the survivor inert until it lifts, then heldEnd`
  - `a pinch release is never a tap`
  - `a move from a pointer that did not start the drag emits nothing`
  - `drag dx and dy are unit deltas since the last point`
  - `a wheel emits one wheel gesture, pressed or not`
  - `mouse moves with nothing pressed hover; touch and pen moves never hover`
  - `leave emits hover with at null`
  - `cancel ends the gesture with no tap`
  - `a mouse down heals a pointer whose up was never seen: heldStart, not a pinch`
- [ ] Run `npx vitest run tests/utils/input/recognize.test.ts` → all fail (no implementation).
- [ ] Implement `initialRecognizerState` and `recognize`. Pure: no clocks, no DOM, no mutation of the input state.
- [ ] Tests pass; `npm run typecheck:fast`.
- [ ] Commit.

---

### Task 2: Binding tables

**Files:**
- Create: `src/@types/input/HeldIntent.d.ts`, `src/@types/input/BindingTable.d.ts`
- Create: `src/data/input/controlBindings.ts`, `src/utils/input/bindPress.ts`
- Test: `tests/utils/input/bindPress.test.ts`

**Interfaces:**
- Consumes: `Press` (Task 1), `ControlSchemeId` (`src/@types/engine/camera/ControlSchemeId.d.ts`, today `'skymap'`).
- Produces:

```ts
export type HeldIntent = 'orbit' | 'pan'; // #837 adds its navigator axes here
export type BindingTable = readonly (readonly [pattern: Partial<Press>, intent: HeldIntent])[];
export const CONTROL_BINDINGS: Readonly<Record<ControlSchemeId, BindingTable>>;
// First row whose every pattern key equals the press's; a table with no match is a bug: throws.
export function bindPress(table: BindingTable, press: Press): HeldIntent;
```

`CONTROL_BINDINGS.skymap` is today's rule (`orbitControls.ts:57-60`): `[{ pointerType: 'mouse', button: 1 }, 'pan']`,
`[{ pointerType: 'mouse', button: 2 }, 'pan']`, `[{}, 'orbit']`.

There is one scheme today, so the saga reads `CONTROL_BINDINGS.skymap` directly (Task 6). #837 adds the scheme
setting and its selector; the spec's "a scheme switch applies from the next press" test lands with it.

- [ ] Tests on `bindPress(CONTROL_BINDINGS.skymap, …)`:
  - `right and middle mouse bind to pan`
  - `left mouse, touch and pen bind to orbit`
  - `a modifier does not change the skymap binding` (shift + left mouse → orbit)
  - `a table with no matching row throws`
- [ ] Implement; tests pass.
- [ ] Commit.

---

### Task 3: The `input` slice, its wake, and the camera and selection answers

review: yes

**Files:**
- Create: `src/@types/input/SourceId.d.ts`, `Motion.d.ts`, `PendingStep.d.ts`, `PickRequest.d.ts`,
  `InputState.d.ts`
- Create: `src/state/input/inputSlice.ts`, `src/state/input/selectors.ts`,
  `src/state/input/watchInputWakeSaga.ts`
- Modify: `src/store/constants.ts` (add `inputRoute = 'input' as const`), `src/store/rootReducer.ts:55-66` (add the
  row), `src/store/rootSaga.ts` (fork `watchInputWakeSaga`)
- Modify: `src/state/camera/cameraSlice.ts` (add `extraReducers`)
- Test: `tests/state/input/inputSlice.test.ts`, `tests/state/camera/cameraSlice.inputGesture.test.ts`,
  `tests/state/input/watchInputWakeSaga.test.ts`

**Interfaces:**
- Consumes: `UnitPoint` (Task 1), `HeldIntent` (Task 2).
- Produces:

```ts
export type SourceId = string; // 'canvas', 'remote:<room>', …
export type Motion = {
  readonly intent: HeldIntent | 'zoom';
  readonly dx: number;            // unit values; 0 for zoom
  readonly dy: number;
  readonly ratio: number;         // 1 for orbit / pan
  readonly at: UnitPoint | null;  // null for a pinch
  readonly held: boolean;         // false for a wheel notch with no gesture open on its source
};
export type PendingStep =
  | { readonly kind: 'start'; readonly source: SourceId }
  | { readonly kind: 'end'; readonly source: SourceId }
  | ({ readonly kind: 'motion'; readonly source: SourceId; readonly aspect: number } & Motion);
// `at: null` on a hover request means "nothing hovered": the driver clears hover without a GPU pick.
export type PickRequest = { readonly source: SourceId; readonly at: UnitPoint | null; readonly seq: number };
export type InputState = {
  readonly sources: Readonly<Record<SourceId, { readonly aspect: number }>>;
  readonly owner: SourceId | null;
  readonly pending: readonly PendingStep[];
  readonly pick: { readonly hover: PickRequest | null; readonly select: PickRequest | null };
  readonly pickSeq: number;
};

// inputSlice.ts actions (type prefix `input/`)
inputSourceAttached({ source, aspect }); inputSourceResized({ source, aspect }); inputSourceDetached({ source });
inputGestureStarted({ source, intent: HeldIntent }); inputGestureEnded({ source });
inputMoved({ source, motion: readonly Motion[] }); inputHovered({ source, at: UnitPoint | null });
inputTapped({ source, at: UnitPoint }); inputConsumed(); inputPickResolved({ which: 'hover' | 'select', seq });

// selectors.ts
selectPendingInput(state: RootState): readonly PendingStep[];
selectPickRequests(state: RootState): InputState['pick'];
```

`PickRequest.at` admits `null` for hover: a plan-time refinement of the spec, so a leave and a gesture start clear the
hover card through the same request the picker already answers.

**Reducer rules:**

- `inputSourceAttached` / `inputSourceResized`: set `sources[source] = { aspect }`.
- `inputSourceDetached`: delete the record.
- `inputGestureStarted`: if `owner` is another source, append `{ kind: 'end', source: owner }` first (takeover);
  set `owner`; append `start`; set `pick.hover` to `{ source, at: null, seq: ++pickSeq }`.
- `inputGestureEnded`: from the owner, append `end` and clear `owner`; from anyone else, ignore.
- `inputMoved`: drop `held` motion from a non-owner; keep `held: false` motion from any source. Stamp each kept
  motion with `sources[source].aspect` (drop it if the source has no record). Merge into the tail when it is a
  `motion` with the same `source`, `intent` and `held`: `dx`/`dy` add, `ratio` multiplies, `at` takes the newest;
  otherwise append.
- `inputHovered`: only while `owner` is null, set `pick.hover = { source, at, seq: ++pickSeq }`.
- `inputTapped`: set `pick.select = { source, at, seq: ++pickSeq }`.
- `inputConsumed`: `pending = []`. Comment the reason this is exact: `runFrame` reads the snapshot and dispatches
  this in one synchronous task (`runFrame.ts:79`), and every source dispatch runs in its own task.
- `inputPickResolved`: clear `pick[which]` only if its `seq` matches.

**Camera slice:** `extraReducers` on `inputGestureStarted`: `dragging = true`, `tween = null` (today's DOM-time pair,
`wireInput.ts:197-200`, now one atomic action). `endDrag` stays as it is: the camera runtime still dispatches it on
`gestureEnd`.

**Wake:** `watchInputWakeSaga` calls `getContext<ReconcileEffects>('reconcile').requestRender()` on
`inputGestureStarted`, `inputMoved` and `inputGestureEnded` only. Never on `inputHovered`, `inputTapped`,
`inputConsumed` or `inputPickResolved`: hover must stay wake-free, and waking on `inputConsumed` would keep the loop
alive forever. Pattern: `src/state/selection/watchSelectionWakeSaga.ts`. Do NOT add `inputRoute` to
`WAKE_ROUTES` in `watchWakeSaga.ts`.

- [ ] Tests, real `rootReducer` (`configureStore`), one assertion focus each:
  - `consecutive same-source same-intent motion merges: dx and dy add, ratio multiplies, at is the newest`
  - `a change of intent or held starts a new pending step`
  - `motion is stamped with the source aspect at fold time, and a resize applies to later motion only`
  - `a takeover appends the old owner's end before the new start`
  - `held motion from a non-owner is dropped; a held: false notch from it is kept`
  - `inputGestureEnded from a non-owner is ignored`
  - `a gesture start replaces the hover request with at null`
  - `hover is stored only while no source owns a gesture`
  - `inputConsumed clears pending, and motion dispatched after it survives into the next read`
  - `a stale inputPickResolved leaves a newer request in place`
  - `inputSourceDetached removes the source record`
  - camera: `inputGestureStarted sets dragging and clears the tween` (an unmatched `extraReducers` case fails
    silently, so this pins the wiring)
  - wake: `wakes on gesture start, motion and end; never on hover, tap, consumed or pick resolved` (stub the
    `reconcile` context, as `tests/state/selection/` does for `watchSelectionWakeSaga`)
- [ ] Run → fail. Implement. Pass; `npm run typecheck:fast`.
- [ ] Commit.

---

### Task 4: The one conversion, the frame's drain, and the camera sim harness

review: yes

**Files:**
- Create: `src/utils/input/unitToViewPx.ts`, `src/utils/input/pendingToInputSteps.ts`
- Modify: `src/services/engine/frame/runFrame.ts:101-134`
- Delete: `src/services/engine/subsystems/inputAggregator.ts`, `src/@types/engine/subsystems/InputAggregator.d.ts`,
  the `inputAggregator` field in `src/@types/engine/handles/EngineSubsystemHandles.d.ts:51` and its construction and
  destroy in `src/services/engine/engine.ts:34,232,429`, `tests/services/engine/subsystems/inputAggregator.test.ts`
- Modify: `tests/helpers/camera/makeCameraSimHarness.ts`, `tests/helpers/camera/simulateCameraFrame.ts:38`,
  `tests/helpers/camera/driveWheelEvents.ts`, `tests/services/engine/frame/runFrame.test.ts`, and every test that
  calls the harness's `push` (today: `stepCameraRuntime.test.ts`, `engagedArmClock.test.ts`,
  `focusReleaseWhileEngaged.test.ts`, `tiltCommitIdempotence.test.ts`, `driverGoldenTrace.test.ts`,
  `tiltRegisterLoop.test.ts`, `poseFold.test.ts`, about 90 call sites; find them with the `Grep` tool on
  `push({ kind:` under `tests/`)
- Test: `tests/utils/input/pendingToInputSteps.test.ts`

**Interfaces:**
- Consumes: `PendingStep`, `selectPendingInput`, `inputConsumed`, `inputGestureStarted`, `inputMoved`,
  `inputGestureEnded`, `inputSourceAttached` (Task 3); `InputStep` (`src/@types/camera/InputStep.d.ts`, unchanged).
- Produces:

```ts
// CSS px of the view: x · width, y · height.
export function unitToViewPx(at: UnitPoint, viewPx: Vec2): Vec2;
export function pendingToInputSteps(pending: readonly PendingStep[], viewPx: Vec2): InputStep[];
```

**Conversion** (the module header states the aspect rule in two lines):

- `start` / `end` → `{ kind: 'gestureStart' }` / `{ kind: 'gestureEnd' }`.
- `orbit` / `pan` motion → `{ kind: 'drag', mode: intent, endPx, startPx }` with `endPx = unitToViewPx(at, viewPx)`
  and `startPx = endPx − [dx · aspect · viewPx[1], dy · viewPx[1]]`: isotropic in units of the source's height.
- `zoom` → `{ kind: 'zoom', factor: ratio, duringGesture: held, cursorPx: at ? unitToViewPx(at, viewPx) : null }`.
- On the canvas's own surface (`aspect = width / height`) this equals today's pixels to float rounding.

**Drain:** in `runFrame.ts`, read `stored` first, then
`steps = pendingToInputSteps(selectPendingInput(stored), canvasPx)` with the `canvasPx` already computed at
`runFrame.ts:123` (hoist it to a local). After the camera step's dispatch loop (`runFrame.ts:134`), dispatch
`inputConsumed()` when `pending` was non-empty. `inputConsumed` must not wake (Task 3).

**Harness:** `makeCameraSimHarness` dispatches `inputSourceAttached({ source: 'canvas', aspect })` for its canvas at
construction and replaces `push(InputGestureEvent)` with pixel-taking helpers that dispatch the new actions, tracking
the last point the way the aggregator did:

```ts
press(intent: HeldIntent, px: Vec2): void;   // inputGestureStarted + remember px
moveTo(px: Vec2): void;                      // inputMoved { dx, dy, at } from the remembered px (held)
pinch(ratio: number): void;                  // inputMoved { intent: 'zoom', ratio, at: null, held: true }
release(): void;                             // inputGestureEnded
wheel(deltaY, cursorPx?): void;              // unchanged signature; held = a gesture is open
```

`wheel` converts with `Math.exp(deltaY · WHEEL_ZOOM_K)`. Rewrite every `push(...)` call site in the vocabulary
above: a `gestureStart` + `dragAnchor` pair becomes `press(mode, px)` (the mode is the one on the following
`dragMove`); `dragMove` → `moveTo`; `pinchAnchor` + `pinchMove` → `pinch(oldDist / newDist)`; `gestureEnd` →
`release`. No test assertion changes.

**Gate:** `driverGoldenTrace.test.ts` and every camera frame test pass with no assertion edited. A failure there means
the conversion or the harness translation is wrong; never re-record.

**Interim:** `wireInput.ts`'s recognizer sink loses its `inputAggregator.push(event)` line (`:201`) and keeps the
rest; drop the `wires the recognizer's emit sink to the aggregator` case in `tests/services/engine/phases/
wireInput.test.ts`. The live canvas does not move the camera between this task and Task 6; the branch ships whole.

- [ ] Tests for `pendingToInputSteps`:
  - `the canvas's own aspect reproduces today's pixel drag` (100 × 50 view, aspect 2: a drag from px (10, 10) to
    (30, 20) round-trips to `startPx ≈ [10, 10]`, `endPx ≈ [30, 20]`)
  - `a 9:16 source moves isotropically on a 16:9 view` (equal unit-of-height motion on both axes gives equal pixel
    deltas)
  - `a pinch gives a zoom step with cursorPx null`
  - `a held: false wheel gives duringGesture false and its cursor in view pixels`
  - `start and end map to gestureStart and gestureEnd in order`
- [ ] Run → fail. Implement the two utils; tests pass.
- [ ] Switch the drain in `runFrame.ts`; delete the aggregator and its type, field, construction and test.
- [ ] Rewrite the harness and every `push` call site (a sweep: one pass, no assertion edits).
- [ ] `npx vitest run tests/services/engine tests/helpers tests/utils/input` → green, golden trace untouched.
- [ ] Commit.

---

### Task 5: The pick driver

review: yes

**Files:**
- Create: `src/services/engine/interaction/createPickDriver.ts`, `src/@types/engine/interaction/PickDriverDeps.d.ts`
- Delete: `src/services/engine/interaction/hoverPickDriver.ts`, `src/@types/engine/interaction/HoverPickDeps.d.ts`,
  `tests/services/engine/interaction/hoverPickDriver.test.ts`, `src/services/engine/interaction/clickHandler.ts`,
  `src/@types/engine/ClickResolver.d.ts`, `ClickResolveInput.d.ts`, `CreateClickResolverInput.d.ts` (and their
  tests, if any)
- Modify: `src/@types/engine/handles/EngineSubsystemHandles.d.ts` (`clickResolver` → `pickDriver: Destroyable |
  null`), `src/services/engine/engine.ts:264,448-449`, `src/@types/engine/state/EnginePickingState.d.ts` (delete
  `pointerDown`), `src/services/engine/engine.ts:147-151`, `tests/services/engine/frame/runFrame.test.ts:166`
- Modify: `src/services/engine/phases/wireInput.ts`: construct the driver instead of the hover driver and the click
  resolver; `onPointerMove` loses the hover-driver call and the marker block, `onPointerDown`/`onPointerUp` lose the
  `pointerDown` writes, and `onClick` becomes a no-op until Task 6 deletes the whole block (taps reach the driver
  only once the source saga exists)
- Test: `tests/services/engine/interaction/createPickDriver.test.ts`

**Interfaces:**
- Consumes: `selectPickRequests`, `inputPickResolved` (Task 3), `unitToViewPx` (Task 4),
  `cssToTexPx` (`src/services/engine/helpers/cssToTexPx.ts`), `PickProgram`, `SelectionResolver['resolvePick']`.
- Produces:

```ts
export type PickDriverDeps = {
  readonly store: { getState(): RootState; dispatch(action: unknown): void; subscribe(listener: () => void): () => void };
  readonly pickProgram: PickProgram;
  readonly resolvePick: SelectionResolver['resolvePick'];
  readonly canvas: { readonly clientWidth: number; readonly clientHeight: number };
  readonly state: Pick<EngineState, 'picking' | 'settings' | 'viewRig'>;
  readonly scheduler: { requestRender(): void };
};
export function createPickDriver(deps: PickDriverDeps): Destroyable; // destroy() unsubscribes
```

**Behaviour:**

- Subscribes to the store. A request is new when its `seq` differs from the last one the driver took for that slot.
- A hover request with `at: null` dispatches `updateSelectionHover(null)` and `inputPickResolved`, with no GPU pick.
- Otherwise the driver picks at `cssToTexPx` of `unitToViewPx(at, [clientWidth, clientHeight])` and dispatches
  `updateSelectionHover(ref)` or `updateSelectionSelect(ref)`, then `inputPickResolved({ which, seq })`.
- One pick in flight at a time, shared by both slots (`state.picking.pickInFlight`). When it settles, the driver
  re-reads the store and fires the newest pending request, select first. This keeps today's trailing re-fire
  (`hoverPickDriver.ts:22-29`) and fixes the tap-during-hover-pick drop (Review Focus 3).
- A failed readback leaves the prior selection and still dispatches `inputPickResolved`.
- The terrain-pick debug marker moves here from `wireInput.ts:131-143`: on a new hover request with a point, when
  `settings.debug.overlays['terrain-pick-marker']` is on and `VIEW_RIGS[viewRig].pickable`, write
  `state.picking.cursorTexPx` and `requestRender()`. Nothing else in the driver wakes the loop.
- No `pointerDown` gate: the reducer already refuses hover while a gesture is owned.

- [ ] Tests, with a fake `pickProgram` whose `pick` returns a controllable promise and a real store:
  - `a hover request picks at the view pixel and dispatches the hover ref, then resolves the request`
  - `a hover request with at null clears hover without a GPU pick`
  - `a select request dispatches updateSelectionSelect`
  - `a tap while a hover pick is in flight selects once the hover pick settles` (Review Focus 3)
  - `moves during an in-flight pick coalesce to one trailing pick at the newest point`
  - `a failed pick keeps the prior selection and resolves the request`
  - `the terrain marker cursor is written only with the overlay on and a pickable rig`
  - `destroy unsubscribes`
- [ ] Run → fail. Implement; swap it into `wireInput.ts`; delete the hover driver, the click resolver and
  `pointerDown`.
- [ ] Tests pass; `npm run typecheck:fast`.
- [ ] Commit.

---

### Task 6: The canvas source, the source saga, and the deletions

review: yes

**Files:**
- Create: `src/services/input/createCanvasDeviceChannel.ts`, `src/state/input/inputSourceSaga.ts`,
  `src/utils/browser/nextAnimationFrame.ts`
- Modify: `src/hooks/useEngine.ts` (fork and cancel the canvas source)
- Modify: `src/services/engine/phases/wireInput.ts` (delete the `attachOrbitControls` block at `:186-217`, the
  pointer and Escape callbacks at `:124-156`, `runPickAtCss`, and their imports),
  `src/services/engine/interaction/inputBindings.ts` (keep only the window `resize` listener and its wake),
  `src/@types/input/AttachEngineInputsOptions.d.ts` (only `canvas` and `scheduler` remain),
  `src/@types/engine/BootstrapDeps.d.ts:47-51` and `src/services/engine/engine.ts:8,324-327,358,426-427` (delete
  `detachControlsRef`), `src/components/NavigationPanel/NavigationPanel.tsx:4` (comment now points at the keyboard
  table)
- Delete: `src/services/camera/orbitControls.ts`, `src/@types/camera/OrbitControlsOptions.d.ts`,
  `src/@types/camera/InputGestureEvent.d.ts`, `src/@types/input/CssPx.d.ts` (if no reader remains),
  `tests/services/camera/orbitControls.test.ts`
- Modify: `tests/services/engine/phases/wireInput.test.ts` (drop the `cancels an in-flight tween on the
  gesture-start emission` case; the B1 guarantee moves to the integration test below), `tests/services/engine/interaction/
  inputBindings.test.ts` (resize only), `tests/services/engine/phases/wireInput.structure.test.ts` (drop the click
  and double-click cases)
- Modify: `docs/backlog/2026-09-29-dragmode-binary-pan-tests.md` and its `docs/BACKLOG.md:40` line: the
  `orbitControls.ts` local `DragMode` bullet is gone; the other four sites remain
- Test: `tests/state/input/inputSourceSaga.test.ts`, `tests/state/input/doubleTapFocus.integration.test.ts`

**Interfaces:**
- Consumes: everything above; `focusSelected` (`src/state/selection/focusSelected.ts`, on main).
- Produces:

```ts
export function createCanvasDeviceChannel(canvas: HTMLCanvasElement): EventChannel<DeviceEvent>;
export function* inputSourceSaga(source: SourceId, channel: EventChannel<DeviceEvent>): SagaIterator;
export function nextAnimationFrame(): Promise<void>;
```

**Canvas channel** (moves the listener half of `orbitControls.ts`): `eventChannel` with `buffers.expanding()` (no
event may drop while the saga is busy). `pointerdown` on the canvas; `pointermove`, `pointerup`, `pointercancel` on
`window`; `pointerleave` and `contextmenu` (`preventDefault`) on the canvas; `wheel` on the canvas with
`{ passive: false }` and `preventDefault` in the listener; a `ResizeObserver` on the canvas → `resize`. `at` is
measured against `canvas.getBoundingClientRect()` (behaviour change 3: canvas-relative). Wheel `ratio =
exp(deltaY · WHEEL_ZOOM_K)`, `deltaY` scaled by `PINCH_WHEEL_GAIN` when `ctrlKey`. `t` is `event.timeStamp`. The iOS
comment (`orbitControls.ts:139-145`) travels verbatim; never `setPointerCapture`. Headless guard as in
`createKeyboardListener.ts`: with no `window`, a channel that never emits.

**Source saga**, generic for every source:

1. Wait for the first `resize`; drop events before it. Put `inputSourceAttached({ source, aspect })`.
2. For each event: `recognize`. A `resize` is an edge: flush, then put `inputSourceResized`.
3. `heldStart` → `bindPress(CONTROL_BINDINGS.skymap, press)` latched for the gesture; flush, then put
   `inputGestureStarted`. `heldEnd` → flush, then put `inputGestureEnded`.
4. `drag` / `pinch` → buffer `Motion` with the latched intent (`zoom` for a pinch), `held: true`. `wheel` → buffer
   `{ intent: 'zoom', ratio, at, held: <a gesture is open on this source> }`. `hover` → keep only the newest.
5. `tap` → only when the press binds to `orbit` (Review Focus 5): flush, put `inputTapped`. `doubleTap` → same filter,
   put `focusSelected()` after the tap.
6. The first buffered item schedules one flush on `nextAnimationFrame()`; the flush puts one `inputMoved` and at most
   one `inputHovered`. No idle frame loop.
7. `finally`: if a gesture is open, put `inputGestureEnded`; then `inputSourceDetached`; close the channel.

**`useEngine`:** beside `createEngine`, `runSaga(inputSourceSaga, 'canvas', createCanvasDeviceChannel(canvas))`;
cancel the task in the effect's cleanup. Widen `RunSaga` (`src/store/types.ts:78`) to pass arguments only if the
current signature cannot.

- [ ] Saga tests (`runSaga` with a hand-driven channel and a stubbed `nextAnimationFrame`):
  - `the source attaches on the first resize with width over height as aspect`
  - `an edge flushes buffered motion before it is put`
  - `a resize flushes before inputSourceResized`
  - `motion inside one frame is one inputMoved`
  - `a wheel with no gesture open is held false; during one it is held true`
  - `a pan-bound tap is not reported`
  - `a doubleTap puts inputTapped then focusSelected`
  - `cancelling the saga ends an open gesture before detaching`
- [ ] Integration test (real `rootReducer`, real `rootSaga`'s focus sagas, the source saga over a hand-driven
  channel): `press, release, press, release on a selected galaxy: the focus tween started by focusSelected survives`
  (B1). Follow the store setup of `tests/state/selection/watchFocusSelectedSaga.test.ts`.
- [ ] Run → fail. Implement the channel, the saga, the `useEngine` fork.
- [ ] Delete `orbitControls.ts`, `OrbitControlsOptions`, `InputGestureEvent`, the pointer and Escape halves of
  `inputBindings`, `detachControlsRef`, and the `wireInput` handlers; trim their tests. `Grep` for every deleted
  symbol afterwards (including comments in `src/` and `docs/RENDERER.md`).
- [ ] Update the backlog detail file and index line.
- [ ] `npm test`, `npm run typecheck:fast` green.
- [ ] Commit.

---

## Definition of Done

**Deliverables:**
- `src/utils/input/{recognize,initialRecognizerState,bindPress,pendingToInputSteps,unitToViewPx}.ts`,
  `src/data/input/{controlBindings,tapSlopPx,doubleTapMs,doubleTapSlopPx,wheelZoomK}.ts`
- `src/state/input/{inputSlice,selectors,watchInputWakeSaga,inputSourceSaga}.ts`, the `input` route in the root reducer
- `src/services/input/createCanvasDeviceChannel.ts`, `src/services/engine/interaction/createPickDriver.ts`
- Gone: `orbitControls.ts`, `inputAggregator.ts`, `hoverPickDriver.ts`, `clickHandler.ts`, `InputGestureEvent`,
  `OrbitControlsOptions`, `detachControlsRef`, `picking.pointerDown`, the pointer and Escape halves of `inputBindings`
- `driverGoldenTrace.test.ts` unmodified

**Smoke, by eye, main and branch side by side** (deep links to the worktree server):
- left-drag orbit; right-drag and middle-drag pan; ctrl-wheel / trackpad pinch
- wheel at rest, wheel during a follow (`#focus=body-earth`), wheel during a fly-to (scroll mid-flight: the fly
  continues)
- hover card on a galaxy, cleared on leave and on press
- click select; double-click focus flies and is not cancelled; right-click on a galaxy does not select
- Escape clears the selection once
- on a phone over the LAN (`npm run phone`): one-finger orbit, pinch zoom, tap select, double-tap focus
- at `?dome`: drag and wheel work on the squared canvas, and the cursor ray lines up (behaviour change 3)

**Deferred (out of scope):**
- the dome remote adapter, relay and remote page; #837's scheme row and navigator; a scheme selector and its
  "switch applies from the next press" test (lands with #837)
- camera driver state into actions (`playClip`, `cameraRuntime`)
- per-event wheel binding; an exclusive single tap
