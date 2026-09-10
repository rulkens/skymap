# Camera: smooth wheel zoom + flick coast (Google Maps / Cesium feel)

**Raised:** 2026-09-09, user, on the spec-2 camera-pivot branch (PR #647).
Investigated, not built. Follow-up PR after #647 lands.

## Ask

Google Maps and Cesium animate a wheel notch instead of jumping, and a short
drag that ends fast coasts a little after release. skymap does neither: a
notch is applied whole in the frame it fired, and release stops the camera dead.

## Ruling context

Grill Q8 (`docs/grill-sessions/globe-camera-pivot-2026-08-24.md`) ruled **no
inertia in the first landing**, and pre-ruled the only acceptable later shape:
Cesium's flick-only synthetic replay, no persistent velocity, cross-cancel on
any new input, replayed in the body-fixed frame. Building this is a Q8
revision and needs the user's word; the shape is already fixed.

## Why it is cheap here

Every camera motion is an `InputStep` (`src/@types/camera/InputStep.d.ts`)
that `inputAggregator` (`src/services/engine/subsystems/inputAggregator.ts`)
collapses per frame and `replayInput` (`src/services/engine/camera/replayInput.ts`)
replays through one path — the surface controller in a body arm, the world-arm
fold otherwise. `gestureEnd` is the single commit site: it bakes the register,
drops the surface latch, and clears `dragging`. Nothing downstream can tell a
synthesized step from a real one. Both features therefore live in the
aggregator, with `nowMs` passed into `drain()`. No change to the controller,
the drivers, the fold, or the authored/displayed two-box.

## A. Smooth zoom

Today: `factor = e^(deltaY·k)` per notch, applied whole; notches in one frame
multiply (`foldZoom`).

Shape: the aggregator keeps a remaining log-factor plus the latest cursor
pixel, and each frame emits a synthetic zoom step releasing a fraction of it
(exponential approach, ~150–250 ms, retargeting as notches arrive). Cursor
anchoring, `anchoredZoomStep`, the roll ride, the tilt mapping and the floor
come for free.

Two consequences to decide up front:

- The orientation settle's decay is defined **per input step**. Ten small
  steps per notch decay unauthored deviation faster than one big step. Make
  the step law "per unit of log-zoom" in the settle un-braid rather than
  accept a silent feel change.
- At-rest zoom commits to the store per step. Treat the ease as a gesture
  (`duringGesture: true` + a synthetic `gestureEnd`) so it commits once.

Trackpads already deliver continuous small deltas (`WHEEL_GESTURE_GAP_MS`
handles their momentum bursts); keep the ease short or they feel laggy.

Estimate: 40–60 lines + two tests (retargeting mid-ease; single commit).

## B. Flick coast

Shape (Cesium `maintainInertia` / `decay`, see
`docs/research/2026-08-24-camera-pivot/cesium-notes.md` §2.9): on release
after a hold under ~400 ms, hold the last drag motion and emit a synthetic
drag step per frame with the motion scaled by `exp(−(1−c)·25·t)`, c ≈ 0.9;
stop under 0.5 px; **only then** emit `gestureEnd`. Deferring `gestureEnd`
keeps the surface latch and the frozen anchor alive and the orbit-drag driver
rendering the register. Any pointer or wheel event cancels the coast (the
aggregator sees it first). Body-fixed replay falls out of the anchored drag
rotation re-solving the ground under the synthetic cursor.

Pan and orbit modes only. Cesium gives tilt and look no inertia, and a
coasting tilt would keep writing the remembered-tilt memory (ruling 12).

Estimate: 80–100 lines + three tests (flick vs hold threshold; decay stops;
cross-cancel).

## Shared hook

The same per-frame synthetic-step emitter would host the gesture-end settle
tween proposed for the jarring tilt-up + zoom-out (SDD ledger, 2026-09-03
ideas list, item 1).

## Sequencing

After the settle un-braid on #647 lands, so the per-step vs per-unit decay
question is answered in one place. Feel constants (ease τ, decay c, flick
threshold) go in `src/data/camera/`.
