# Controls — Input Surface During the Cosmic Zoom

This spec is the source of truth for **what every input device does at every moment of the tour**. It is the contract between the input layer (`src/services/input/`, `src/services/camera/orbitControls.ts`) and the new tour state machine introduced in [`00-interaction-model.md`](00-interaction-model.md).

It is intentionally exhaustive. Whenever a contributor wonders "should the scroll wheel zoom while the camera is on rails?" the answer is in the per-state table below — not in a designer's head, not in the source. We use `type` aliases throughout, never `interface`.

## 1. Input modalities

Four modalities with different ergonomic shapes. We do not aim for parity — we aim for a sensible default in each, with the same _semantics_ (pause, replay, exit) and different physical gestures.

- **Keyboard** — the most affordable modality. Desktop visitors have one, kiosks paired with a USB keyboard support it, screen readers can drive it. The keyboard surface is the **canonical** binding set; every other modality is a translation of it.
- **Mouse and trackpad** — second-most-universal. `attachOrbitControls` already coalesces mouse + pen + touch behind the Pointer Events API. During the tour we disable pointer-driven camera motion to avoid fighting the cinematic camera path.
- **Touch** — phones, tablets, kiosk touchscreens. No hover, no wheel, no right-click. We rely on tap targets ≥44 px and on single-finger drag → orbit once the tour ends. During PLAYING the canvas absorbs all touch except on the visible Pause button.
- **SpaceMouse (3Dconnexion)** — a 6DOF puck. A small but engaged sub-population plug one in. Treated as a peer to mouse/keyboard for **free fly only**, never as a tour control. Disabling it during PLAYING avoids the worst possible bug: a desk vibration shoving the on-rails camera off course.

## 2. Per-state input table

State names match the tour state machine in [`00-interaction-model.md`](00-interaction-model.md):

- `IDLE` — page loaded, tour not started, default skymap UI live.
- `PLAYING` — tour is running, camera on rails.
- `PAUSED` — tour is paused mid-shell, camera held.
- `FREE_FLY` — tour ended (or was exited), default skymap UI is back.

| Input                       | IDLE                | PLAYING                            | PAUSED                  | FREE_FLY                      |
| --------------------------- | ------------------- | ---------------------------------- | ----------------------- | ----------------------------- |
| `Space`                     | start tour          | pause                              | resume                  | toggle auto-rotate (existing) |
| `Esc`                       | close any panel     | exit tour → FREE_FLY               | exit tour → FREE_FLY    | close any panel               |
| `R`                         | replay tour         | restart current shell              | restart current shell   | replay tour                   |
| `?` / `H`                   | toggle help overlay | toggle help (does not pause)       | toggle help             | toggle help                   |
| `F`                         | fullscreen toggle   | fullscreen toggle                  | fullscreen toggle       | fullscreen toggle             |
| `←` / `→`                   | (no-op)             | (no-op — no skip in v1)            | (no-op)                 | (no-op)                       |
| Mouse drag on canvas        | orbit               | (ignored)                          | orbit (free explore)    | orbit                         |
| Mouse wheel on canvas       | zoom                | (ignored)                          | zoom                    | zoom                          |
| Mouse click on canvas       | pick galaxy         | (ignored)                          | pick galaxy             | pick galaxy                   |
| Mouse hover on tour buttons | reveal tooltip      | reveal tooltip                     | reveal tooltip          | reveal tooltip                |
| Touch drag on canvas        | orbit               | (ignored)                          | orbit                   | orbit                         |
| Touch pinch                 | zoom                | (ignored)                          | zoom                    | zoom                          |
| Touch tap on canvas         | pick galaxy         | (ignored)                          | pick galaxy             | pick galaxy                   |
| SpaceMouse 6DOF axes        | drive camera        | **suppressed at the source**       | drive camera            | drive camera                  |
| Browser back / `Alt-←`      | (browser default)   | exit tour → FREE_FLY (intercepted) | exit tour → FREE_FLY    | (browser default)             |

Two observations constrain the implementation:

1. **PLAYING is the only state in which the canvas is input-inert.** Every other state respects the existing free-fly bindings, so the tour state machine only needs to gate one thing — the canvas pointer/wheel/touch path — not redo the entire input layer.
2. **Help, fullscreen, and tooltips are always available.** They never disturb the camera. A visitor who hits `?` mid-tour gets help and the tour keeps playing.

## 3. Keyboard reference card

The help overlay (`?` / `H`) renders this verbatim. Fewer than ten keys total, scannable in three seconds.

| Key            | Action                                  |
| -------------- | --------------------------------------- |
| `Space`        | Start, pause, or resume the tour        |
| `Esc`          | Exit the tour and return to free-fly    |
| `R`            | Replay the tour from the start          |
| `?` or `H`     | Show / hide this help                   |
| `F`            | Toggle fullscreen                       |
| Mouse drag     | Orbit (free-fly only)                   |
| Scroll / pinch | Zoom (free-fly only)                    |

We deliberately reuse `Space` for both "start the tour" (in IDLE) and "pause / resume" (in PLAYING / PAUSED). It is the most discoverable key and the most common video-player binding worldwide. The cost — a free-fly user who taps `Space` triggers auto-rotate, while an IDLE user triggers the tour — is mitigated by IDLE only existing for a few seconds before the user does something.

We deliberately do **not** bind arrow keys to "next shell / previous shell." Per narrative-script open question 1, skipping shells in v1 cheapens the cinematic and adds state-machine surface area for no proven user benefit. Re-evaluate after launch metrics.

## 4. Mouse and touch

### IDLE and FREE_FLY

Full existing orbit-controls behaviour is live (see `src/services/camera/orbitControls.ts`):

- **Drag** rotates the camera around the look-at point ("globe drag" — drag right sweeps the world right).
- **Wheel** dollies in and out, clamped to the configured min/max distance.
- **Click** picks the nearest galaxy under the cursor (via the r32uint pick texture).
- **Double-click** centres the camera on the picked target.
- **Right-drag** pans the look-at point.

### PLAYING

The canvas swallows all pointer events with `event.preventDefault()` and `event.stopPropagation()` before the orbit controls see them. We do this at the canvas wrapper, **not** by detaching listeners — detach/reattach is a recipe for stuck modifier-key state and lost cursor capture. A single boolean flag in the tour state machine, checked at the top of each handler, is sufficient.

The cursor is hidden after 2 s of inactivity (per narrative script `T+0:00`). It reappears the moment the pointer moves, even though canvas movement is otherwise inert — visitors need to be able to see the Pause button when they reach for it.

### PAUSED

Identical to FREE_FLY. The user can orbit, zoom, pan, pick, and double-click freely. The camera does not return to the tour path until resume; on resume, the engine re-eases from the current camera state to the next waypoint. This is critical for Principle 4 (pause-friendly) of the product vision.

### Touch specifics

Touch sits on the Pointer Events path so the bindings above apply unchanged. There is no right-drag; pan-the-look-at-point is bound to two-finger drag, and pinch-zoom is mapped to wheel deltas internally. None of this is tour-specific — it is the existing free-fly behaviour, gated identically by the tour state.

## 5. SpaceMouse

`spaceMouseToCamera.ts` already integrates 6DOF axes into the orbit camera per frame. Two changes:

1. **Add a `setSuppressed(bool)` switch on the integrator.** While suppressed, every report is dropped on the floor before any camera mutation. We suppress at the integrator layer rather than detaching the WebHID listener so the device stays paired and the connection-state UI stays accurate.
2. **Wire the suppress flag to `tour.state === 'PLAYING'`.** Suppression engages the moment the user clicks "Take the tour" and lifts the moment the tour transitions out of PLAYING (PAUSED, FREE_FLY, or replay-restart).

Suppression intentionally does **not** apply during PAUSED. A PAUSED user reaching for the SpaceMouse to look around inside a shell should get the same response as one reaching for the mouse — that is the entire point of pause.

We do not light up SpaceMouse buttons (Report ID 3) for tour controls. The device's two buttons vary across product generations and across users' muscle memory, and the cost of getting it wrong (accidentally cancelling someone's tour) is high. Keyboard `Space`/`Esc` cover the use case.

## 6. Conflict resolution

Every transition out of PLAYING is **cancel-then-act**:

- User clicks **Replay** while PLAYING → cancel current tour (clear timeline, drop overlay text), then start a fresh tour from `T+0:00`.
- User clicks **Exit** (or `Esc`) while PLAYING → cancel current tour, transition to FREE_FLY.
- User clicks **Pause** (or `Space`) while PLAYING → freeze the timeline at the current `T+`, transition to PAUSED. Camera, overlay text, and any in-flight per-shell tweens are held.
- User starts the tour while a tween from a previous user-driven camera move is mid-flight → cancel the tween, then transition to PLAYING.

Single principle: **only one camera owner at a time**. The tour state machine owns the camera during PLAYING; the user owns it during FREE_FLY/PAUSED/IDLE; no shared-ownership intermediate state exists.

## 7. Hover affordances

Tour buttons (Take the tour, Replay, Pause, Resume, Exit) share the same hover behaviour:

- Cursor switches to `pointer`.
- A tooltip appears after 400 ms with the keyboard shortcut in parentheses, e.g. `Pause tour (Space)`.
- The button background brightens by ~10% to confirm the hit region.
- On focus (keyboard tab navigation), the same tooltip + brightness applies, plus a 2 px focus ring in the brand accent.

The canvas itself has **no** hover affordance during PLAYING. The cursor stays hidden, no tooltip, no cursor-change. Any visual reaction to mouse motion during the cinematic feels like a bug. The single exception is the cursor-reappear-on-motion behaviour from §4, which is a navigation aid for finding the Pause button, not a hover affordance.

## 8. Click target sizes

All tour buttons must meet a minimum **44 × 44 CSS px** hit region (WCAG 2.5.5 / Apple HIG / Material Design all converge here). This is the kiosk-touchscreen baseline; respecting it on desktop costs nothing.

The primary "Take the tour" CTA in IDLE is intentionally **larger** — target 56 px tall, ≥220 px wide, sized to read as the obvious next action without dominating the canvas. Per the product-vision opening, this button is the single most important UI element in the entire app: the bridge from "I don't know what this is" to "I want to keep exploring." Treat it accordingly.

In-tour controls (Pause, Exit) sit in the bottom-right cluster, also at the 44 px minimum, with at least 8 px of inter-button spacing so a stray finger doesn't land between them.

## 9. Discoverability

A first-time visitor who clicks "Take the tour" must learn about pause **without reading documentation**. Three layers, in order of subtlety:

1. **Opening overlay copy** at `T+0:01` reads `Press space to pause · esc to exit` as a sub-line under `TOUR BEGINS · 90 SECONDS`. Always shown on first launch; suppressed for repeat visitors via `localStorage` flag.
2. **Pause button visible** in the bottom-right corner throughout PLAYING, at 60% opacity, brightening to 100% on cursor motion.
3. **Help key (`?`)** documented in the overlay copy and discoverable via the always-visible help icon in the corner.

We do not ship an interactive tutorial, modal, or "press space now" prompt. The opening overlay is enough; anything more interrupts the cinematic before it has earned the user's attention.

## 10. Test criteria

A change to the input layer is shippable when:

- `Space`, `Esc`, `R`, `?`, `H`, `F` all behave per §3 in every state, validated by Vitest unit tests against the tour state machine.
- The canvas absorbs all pointer/wheel/touch events during PLAYING — verified by an integration test that simulates pointer events and asserts the orbit camera state is unchanged.
- SpaceMouse axes are suppressed during PLAYING — verified by a unit test that calls the integrator's `onAxes` callback and asserts the camera state is unchanged.
- Clicking Replay while PLAYING cancels the in-flight tour cleanly — no stuck overlay text, no leaked timeline timer, no double-fire of `T+0:00` callbacks.
- Tab navigation reaches every tour button in source order, with a visible focus ring on each.
- All tour buttons meet 44 × 44 px minimum, the CTA meets 56 × 220, validated by a Playwright accessibility audit.
- The `?tour=auto` URL flag (kiosk mode) starts the tour on load without any user gesture and loops forever without state corruption — validated by a 4-loop run that asserts no console errors and no growing memory.

## 11. Files touched

Source of work for the implementer. Paths are repository-relative.

- `src/services/engine/tourStateMachine.ts` — new module owning the `IDLE | PLAYING | PAUSED | FREE_FLY` state and its transitions.
- `src/services/camera/orbitControls.ts` — gate the existing handlers on `tour.state !== 'PLAYING'`.
- `src/services/input/spaceMouseToCamera.ts` — add `setSuppressed(bool)` and respect it in the per-frame integration.
- `src/services/engine/bootstrap.ts` — wire the tour state machine to the orbit controls and SpaceMouse integrator.
- `src/components/TourControls.tsx` — bottom-right Pause/Replay/Exit cluster (new).
- `src/components/TakeTheTourButton.tsx` — primary CTA shown in IDLE (new).
- `src/components/HelpOverlay.tsx` — renders the keyboard reference card from §3 (new).
- `src/services/engine/keyboardBindings.ts` — central key → tour-action dispatch table (new).
- `tests/services/engine/tourStateMachine.test.ts` — state-machine unit tests (new).
- `tests/services/input/spaceMouseToCamera.test.ts` — extend with suppression tests.
- `tests/components/TourControls.test.tsx` — button hit-region and tooltip tests (new).

Sister specs:

- [`00-interaction-model.md`](00-interaction-model.md) — the tour state machine; this spec consumes its state names.
- [`01-information-overlays.md`](01-information-overlays.md) — overlay text positioning that the help overlay must not collide with.
- [`02-tour-affordances.md`](02-tour-affordances.md) — CTA visual design that this spec sizes the hit regions for.
