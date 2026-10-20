# Input architecture — design

Every input source (the canvas today, the dome remote next, a gamepad or WebXR controller later) reaches the camera
and the picker through one layered path: **source → recognition → binding → intents in the store → engine**. Nothing
calls into the engine; the store's actions are the only interface.

Decisions and their alternatives: [`input-architecture-2026-10-14.md`](../../../grill-sessions/input-architecture-2026-10-14.md)
(Q1–Q14 and the ground check GC1–GC5). This spec cites them as `Q<n>` / `GC<n>`.

## Intent

- **Who:** anyone driving the camera — a mouse or touch user on the canvas, a presenter on a remote, later a
  controller.
- **Outcome:** adding a source is one adapter and one saga fork; the engine never learns a source exists.
- **Success:** the canvas behaves as today apart from the listed behaviour changes; the dome remote (separate spec)
  plugs in as a source with no engine change; #837 rewrites as a binding row plus its navigator intent.

## Rulings

| #       | Ruling                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1      | Intents cross into the engine; recognition and binding run outside it                                                                                    |
| Q2      | Intents travel as Redux actions; nothing reaches into the engine                                                                                         |
| Q3, Q13b | A reducer folds pending input in an `input` slice; the frame reads it from its snapshot and dispatches `inputConsumed`                                 |
| Q4      | Motion is coalesced per animation frame per source; edges flush the buffer, then dispatch at once                                                        |
| Q5      | Binding is a pure table per control scheme, read at press and latched for the gesture                                                                    |
| Q6      | The latest source to start a held gesture takes over                                                                                                     |
| Q7–Q9   | Positions are unit values (0..1 per axis of the source's surface); each source states its aspect in a source record                                     |
| Q10     | Pick requests live in state; the engine subscribes to the store and runs the off-frame pick                                                              |
| Q11–Q12 | Double-tap is detected by us; a tap is reported at once and a double-tap in addition                                                                     |
| Q13     | `useEngine` forks the canvas source saga; the engine attaches no pointer listeners                                                                      |
| GC1     | Gestures are **held** (press → release: drag, pinch) or **atomic** (one event: wheel notch, tap, double-tap); only held gestures own the camera           |
| GC2     | `inputConsumed` clears all pending input (exact: `runFrame` is synchronous)                                                                              |
| GC3     | A second finger stays inside the held gesture; a pinch keeps today's centre zoom (ratio only, no translation, no position)                               |
| GC5     | `focusSelected` ships first, as its own PR                                                                                                               |

## Ground preparation

Ground check run 2026-10-14 (refactor-ground, with a greenfield cross-check). One prep, shipped as its own PR before
this one: **`focusSelected`**, a reducer-less command (`goHome` is the precedent) handled by
`watchFocusSelectedSaga`, which replaces the two inline "focus what is selected" copies in the `f` shortcut and the
canvas double-click. The double-tap gesture dispatches the same action.

Everything else lands as growth (a `rootReducer` row, sagas forked through `runSaga`, a second table keyed by
`ControlSchemeId`) or as replacement of the input path below. `InputStep` and the camera code that consumes it
(11 files in `src/`) do not change: the one conversion function produces today's steps.

## Shape

### Device events — what a source adapter produces

```ts
// src/@types/input/UnitPoint.d.ts — 0..1 per axis of the source's own surface, origin top-left.
export type UnitPoint = { readonly x: number; readonly y: number };

// src/@types/input/Modifiers.d.ts
export type Modifiers = { readonly shift: boolean; readonly ctrl: boolean; readonly alt: boolean; readonly meta: boolean };

// src/@types/input/DeviceEvent.d.ts — `t` is the browser's event.timeStamp (ms).
export type DeviceEvent = { readonly t: number } & (
  | {
      readonly kind: 'down' | 'move' | 'up' | 'cancel';
      readonly pointer: number;
      readonly pointerType: 'mouse' | 'touch' | 'pen';
      readonly button: 0 | 1 | 2;
      readonly at: UnitPoint;
      readonly mods: Modifiers;
    }
  | { readonly kind: 'wheel'; readonly ratio: number; readonly at: UnitPoint; readonly mods: Modifiers }
  | { readonly kind: 'leave' }
  | { readonly kind: 'resize'; readonly widthPx: number; readonly heightPx: number }
);
```

- The adapter turns `deltaY` into a zoom `ratio` (`exp(deltaY · WHEEL_ZOOM_K)`, ctrl-wheel scaled by
  `PINCH_WHEEL_GAIN`), so browser units stop at the source. `WHEEL_ZOOM_K` moves to `src/data/input/`.
- `resize` carries pixels so the recognizer can keep today's pixel thresholds (tap slop); the action that leaves the
  saga carries only the aspect.
- `leave` is the canvas's `pointerleave`, which clears hover.

### Recognition — a pure function

```ts
// src/@types/input/Gesture.d.ts
export type Gesture =
  | { readonly kind: 'heldStart'; readonly press: Press; readonly at: UnitPoint }
  | { readonly kind: 'drag'; readonly dx: number; readonly dy: number; readonly at: UnitPoint }
  | { readonly kind: 'pinch'; readonly ratio: number } // centre zoom: no position (GC3)
  | { readonly kind: 'heldEnd' }
  | { readonly kind: 'wheel'; readonly ratio: number; readonly at: UnitPoint; readonly mods: Modifiers }
  | { readonly kind: 'hover'; readonly at: UnitPoint | null }
  | { readonly kind: 'tap'; readonly at: UnitPoint }
  | { readonly kind: 'doubleTap'; readonly at: UnitPoint };

// src/@types/input/Press.d.ts
export type Press = { readonly button: 0 | 1 | 2; readonly pointerType: 'mouse' | 'touch' | 'pen' } & Modifiers;

// src/utils/input/recognize.ts
export function recognize(
  state: RecognizerState,
  event: DeviceEvent,
): { readonly state: RecognizerState; readonly gestures: readonly Gesture[] };
```

`RecognizerState` (its own `@types` file) holds the surface size, the pressed pointers, the open held press, the
pinch span, the tap candidate and the last tap. Rules, all carried from today's `orbitControls.ts` unless marked:

- **Held start** on the first contact; a second contact turns the gesture into a pinch without a new start (GC3);
  pinch motion is the span ratio, old ÷ new, with the span measured with the aspect applied.
- **Pinch broken** (one of two lifts): the survivor drives nothing until it lifts; the gesture ends when the last
  pointer lifts or on `cancel`.
- **Only the pointer that started a drag drives it.**
- **Tap:** a held gesture that ends within `TAP_SLOP_PX` (4, today's value) of its press, on a press bound to `orbit`.
  Reported right after `heldEnd`.
- **Double-tap (new, Q11):** a tap within `DOUBLE_TAP_MS` and `DOUBLE_TAP_SLOP_PX` of the previous tap. Reported in
  addition to the second `tap` (Q12). Both constants are named in `src/data/input/`.
- **Hover:** mouse `move` with no pointer down; `leave` emits `hover` with `at: null`. Touch and pen never hover.
- **Wheel** is atomic (GC1): one `wheel` gesture per event.

### Binding — one table per control scheme

```ts
// src/@types/input/HeldIntent.d.ts — #837 adds its navigator axes here.
export type HeldIntent = 'orbit' | 'pan';

// src/@types/input/BindingTable.d.ts — ordered; the first pattern that matches wins.
export type BindingTable = readonly (readonly [pattern: Partial<Press>, intent: HeldIntent])[];

// src/data/input/controlBindings.ts
export const CONTROL_BINDINGS: Readonly<Record<ControlSchemeId, BindingTable>>;
```

`skymap`'s table is today's rule: mouse button 1 or 2 → `pan`, anything else → `orbit`. The source saga `select`s the
active scheme's table at `heldStart` and latches the intent for the whole gesture (Q5). A wheel is always `zoom` in
this PR; per-event wheel binding waits for a scheme that needs it.

### Intents — the `input/` actions

```ts
// src/@types/input/SourceId.d.ts
export type SourceId = string; // 'canvas', 'remote:<room>', …

// src/@types/input/Motion.d.ts — one shape for drag, pinch and wheel.
export type Motion = {
  readonly intent: HeldIntent | 'zoom';
  readonly dx: number; // unit values; 0 for zoom
  readonly dy: number;
  readonly ratio: number; // 1 for orbit / pan
  readonly at: UnitPoint | null; // null for a pinch
  readonly held: boolean; // false for an atomic wheel notch — today's at-rest lane
};
```

| Action                                         | Who dispatches             | Meaning                                                            |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| `inputSourceAttached({ source, aspect })`      | source saga, at start      | The source exists; its surface aspect                              |
| `inputSourceResized({ source, aspect })`       | source saga                | The surface changed shape (phone flip, panel resize)               |
| `inputSourceDetached({ source })`              | source saga `finally`      | The source is gone (after it has ended any open gesture)           |
| `inputGestureStarted({ source, intent })`      | source saga                | A held gesture begins                                              |
| `inputGestureEnded({ source })`                | source saga                | It ends — the one end path, also run by the saga's `finally`       |
| `inputMoved({ source, motion: Motion[] })`     | source saga, ≤ 1 per frame | The frame's coalesced motion                                       |
| `inputHovered({ source, at })`                 | source saga, ≤ 1 per frame | Latest hover point, or `null` on leave                             |
| `inputTapped({ source, at })`                  | source saga                | A select request                                                   |
| `focusSelected()`                              | source saga, on double-tap | The prep command, shared with the `f` key                          |
| `inputConsumed()`                              | engine, in the frame       | Pending input has been applied                                     |
| `inputPickResolved({ which, seq })`            | engine                     | A pick request has been answered                                   |

### The `input` slice

```ts
// src/@types/input/PendingStep.d.ts
export type PendingStep =
  | { readonly kind: 'start'; readonly source: SourceId }
  | { readonly kind: 'end'; readonly source: SourceId }
  | ({ readonly kind: 'motion'; readonly source: SourceId; readonly aspect: number } & Motion);

// src/@types/input/PickRequest.d.ts
export type PickRequest = { readonly at: UnitPoint; readonly seq: number };

// src/@types/input/InputState.d.ts
export type InputState = {
  readonly sources: Readonly<Record<SourceId, { readonly aspect: number }>>;
  readonly owner: SourceId | null;
  readonly pending: readonly PendingStep[];
  readonly pick: { readonly hover: PickRequest | null; readonly select: PickRequest | null };
  readonly pickSeq: number;
};
```

Reducer rules:

- **`inputGestureStarted`:** if another source owns a gesture, append its `end` first (takeover, Q6); set `owner`;
  append `start`; clear `pick.hover`.
- **`inputGestureEnded`:** from the owner, append `end` and clear `owner`; from anyone else, ignored.
- **`inputMoved`:** held motion from a non-owner is dropped; atomic motion (`held: false`) is accepted from any
  source (GC1). Each kept motion is stamped with `sources[source].aspect` and merged into the tail when source,
  intent and `held` match: `dx`, `dy` add, `ratio` multiplies, `at` takes the latest; otherwise appended.
- **`inputHovered`:** stored as `pick.hover` only while `owner` is null (Q10).
- **`inputTapped`:** stored as `pick.select`, with the next `pickSeq`.
- **`inputConsumed`:** clears `pending`. The comment states why that is exact (GC2).
- **`inputPickResolved`:** clears the request whose `seq` matches; a stale answer leaves a newer request alone.
- **`inputSourceDetached`:** removes the source record.

The camera slice answers `inputGestureStarted` through `extraReducers` with today's two DOM-time edges, now atomic:
`dragging = true` and `tween = null`. This is what keeps a double-click's focus fly alive (the B1 landmine): the
second press's start is dispatched before the double-tap's `focusSelected`, by the flush-then-edge order.

### The engine side

- **The drain** (`runFrame.ts:108`): `pendingToInputSteps(selectPendingInput(stored), canvasPx)` replaces
  `inputAggregator.drain()`; `inputConsumed()` joins the camera step's dispatch loop when `pending` was non-empty.
- **The one conversion** (`src/utils/input/pendingToInputSteps.ts`), whose header states the aspect rule:
  - `start` / `end` → `gestureStart` / `gestureEnd`.
  - Held `orbit` / `pan` → `drag` with `endPx = at × view` (point to point, per axis) and
    `startPx = endPx − (dx · aspect · viewHeight, dy · viewHeight)` (isotropic in units of the source's height).
  - `zoom` → `{ factor: ratio, duringGesture: held, cursorPx: at ? at × view : null }`.
  - On the canvas's own surface (`aspect = width / height`) this reduces exactly to today's pixels.
- **Points** go through `unitToViewPx(at, viewPx)` (`src/utils/input/unitToViewPx.ts`), shared by the conversion and
  the picker.
- **The pick driver** replaces `hoverPickDriver`: the engine subscribes to the store, and on a new `pick.hover` or
  `pick.select` runs the existing off-frame pick at `unitToViewPx(at)`, dispatches `updateSelectionHover` /
  `updateSelectionSelect` as now, then `inputPickResolved`. Today's in-flight coalescing and trailing re-fire carry
  over. The debug terrain-pick marker reads its cursor from the hover request.
- **Deleted:** `inputAggregator` (and its `EngineState` field and type), `InputGestureEvent`, `attachOrbitControls`
  and `OrbitControlsOptions`, the pointer and Escape halves of `inputBindings` (only `resize` stays),
  `picking.pointerDown` (its gate is "a gesture is owned"), `detachControlsRef` in `BootstrapDeps`, and
  `wireInput`'s click and double-click handlers.

### The canvas source

- **`createCanvasDeviceChannel(canvas): EventChannel<DeviceEvent>`** (`src/services/input/`): `pointerdown` on the
  canvas, `pointermove` / `pointerup` / `pointercancel` on `window`, `pointerleave` and `contextmenu` on the canvas,
  `wheel` with `{ passive: false }` and `preventDefault` inside the listener, a `ResizeObserver` on the canvas.
  Positions are measured against `canvas.getBoundingClientRect()`. The iOS landmine carries over verbatim: never
  `setPointerCapture`.
- **`inputSourceSaga(source, channel)`** (`src/state/input/`), generic for every source: attach; loop over the
  channel through `recognize`; bind at `heldStart`; buffer motion and hover; before any edge, flush, then put the
  edge; one `requestAnimationFrame` flush is scheduled when the buffer first fills (no idle frame loop); `finally`
  ends an open gesture, then detaches.
- **`useEngine`** forks `inputSourceSaga('canvas', createCanvasDeviceChannel(canvas))` through `runSaga` beside
  `createEngine`, and cancels it on unmount.

## Behaviour changes

1. **Double-tap timing is ours** (Q11): the OS double-click speed no longer applies.
2. **Escape is handled once**, by the keyboard shortcut table.
3. **Positions are canvas-relative**: an offset canvas (the dome's CSS-squared one) gets correct cursor rays.

Everything else is meant to be identical, including the at-rest wheel and the centre pinch.

## Out of scope

- The dome remote's adapter, relay, remote page and command registry (its own spec, rewritten against this one).
- #837's OpenSpace scheme: rewritten on top as a `CONTROL_BINDINGS` row, `HeldIntent` members and its navigator.
- Moving the camera's driver state into actions (`playClip`, `cameraRuntime`): a later stage.
- Per-event wheel binding and an exclusive single tap.

## Verification

- **`recognize`:** tap within and beyond the slop; double-tap inside and outside the window and the distance; held
  start on first contact only; pinch ratio with an aspect ≠ 1; pinch break leaves the survivor inert; a pointer that
  didn't start the drag doesn't drive it; wheel is atomic; hover from mouse only, `leave` clears it; `cancel` ends.
- **`CONTROL_BINDINGS.skymap`:** right and middle mouse → `pan`; left mouse, touch and pen → `orbit`.
- **The `input` reducer:** merge rules; takeover appends the old owner's `end`; held motion from a non-owner dropped
  and atomic motion kept; hover stored only with no owner; `inputConsumed` clears and a later `inputMoved` survives
  into the next read; a stale `inputPickResolved` leaves a newer request.
- **The camera slice:** `inputGestureStarted` sets `dragging` and clears `tween` (an unmatched `extraReducers` case
  fails silently, so this is pinned).
- **`pendingToInputSteps`:** the canvas's own aspect gives today's pixels; a 9:16 source moves isotropically on a
  16:9 view; a pinch gives `cursorPx: null`.
- **`inputSourceSaga`:** an edge flushes buffered motion first; a scheme switch applies from the next press; `finally`
  ends an open gesture before detaching.
- **B1 regression (integration, real store):** press, release, press, release, double-tap → the focus tween started
  by `focusSelected` survives.
- **By eye**, against main, side by side: orbit, right-drag pan, wheel at rest during a follow and during a fly-to,
  pinch, tap select, double-tap focus, hover card, Escape; on a phone over the LAN; at `?dome`.

## Build order

1. **Prep PR:** `focusSelected`.
2. **This PR**, in commits: types and the pure recognizer with its tests → bindings → the `input` slice and the
   camera `extraReducers` → the conversion and the drain → the pick driver → the canvas channel and source saga, the
   `useEngine` fork, and the deletions.
3. **Then** #837 rebased on top, then the dome remote.
