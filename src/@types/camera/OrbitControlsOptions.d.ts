/**
 * OrbitControlsOptions — optional configuration for `attachOrbitControls`.
 *
 * All fields are optional — omitting the object entirely gives the same
 * behaviour as the original single-argument overload (orbit only, no click).
 */

import type { BodyId } from '../data/body/BodyId';
import type { LonLatDeg } from '../scene/LonLatDeg';
import type { Mat3 } from '../math/Mat3';
import type { Vec3 } from '../math/Vec3';
import type { OrbitControlsDebugSample } from './OrbitControlsDebugSample';

export type OrbitControlsOptions = {
  /**
   * Called when the user clicks (as opposed to drags) on the canvas.
   *
   * A 'click' is defined as a pointerup that occurred within 4 CSS pixels of
   * the corresponding pointerdown. This threshold distinguishes intentional
   * taps from the tiny pointer jitter that always precedes a drag start.
   *
   * Coordinates are in CSS pixels (matching `e.clientX` / `e.clientY`), so
   * the caller can pass them directly to pick-coordinate conversion without
   * any additional scaling.
   *
   * @param xCss  Horizontal CSS pixel position of the click.
   * @param yCss  Vertical CSS pixel position of the click.
   */
  onClick?: (xCss: number, yCss: number) => void;
  /**
   * Called when the user double-clicks (or double-taps) the canvas.
   *
   * We delegate the 'two clicks within the OS-defined time + distance threshold'
   * detection to the browser's native `dblclick` event rather than rolling our
   * own timer. The browser already follows the user's accessibility/sensitivity
   * preferences, and on touch screens the same event fires for a quick
   * double-tap — no extra branching here.
   *
   * Note: native `dblclick` fires AFTER both `click` events, so any `onClick`
   * handler will have already run twice. That is intentional — the engine
   * wires single-click to 'select' and double-click to 'focus', and a
   * double-click cleanly upgrades a selection into a focus tween without
   * missing either step.
   */
  onDoubleClick?: (xCss: number, yCss: number) => void;
  /**
   * Called every time the camera state has been mutated by this module (any
   * pointer drag, pan, or wheel zoom). The engine wires this to
   * `scheduler.requestRender()` so a single user gesture wakes the render loop
   * for one frame; `onGestureStart` / `onGestureEnd` carry the Redux
   * bookkeeping around gesture boundaries.
   *
   * Fired AFTER `updatePosition(cam)` so the camera state is fully settled
   * before the engine reads it for the next frame.
   */
  onChange?: () => void;
  /**
   * Called for a wheel zoom that occurs with NO pointer gesture in progress,
   * with the multiplicative distance `factor` (e^(deltaY·k)). The engine commits
   * the zoom straight into the store `base` — without a gesture, `dragging` is
   * false, so the `resting` driver renders `base` and a mutation of the live
   * `cam` register would be invisible. A wheel DURING a drag/pinch instead folds
   * into `cam` (the `orbitDrag` driver renders it live) and rides the
   * `onGestureEnd` commit, so it does not go through this callback.
   */
  onZoom?: (factor: number) => void;
  /**
   * Physical radius (Mpc) of whatever the camera currently orbits, or `null`
   * when the pivot has no surface. Read at the start of a pinch or
   * wheel-during-gesture so `clampDistance` floors the distance just off
   * that surface instead of at the absolute floor (~309 km, deep inside
   * Earth).
   *
   * A getter, not a cached value — this module holds no scene state; the
   * engine wires it to `pivotRadiusMpc(selectFocusRow(...))`. Omitted
   * (tests, or no scene) ⇒ only the global floor applies.
   */
  pivotRadiusMpc?: () => number | null;
  /**
   * The cursor's current surface hit against the focused body — `{ bodyId,
   * point }` in that body's local lon/lat — or `null` when nothing has ever
   * hit / no body is focused. A getter, not a cached value — mirrors
   * `pivotRadiusMpc`'s shape: this module holds no scene state, so the
   * engine wires it to a live read of `state.picking.hoveredSurfacePoint`.
   * Consumed by the zoom-bias anchor capture and the drag-grab capture (§4.4,
   * `dragPivotFrame` below).
   */
  hoveredSurfacePoint?: () => { readonly bodyId: BodyId; readonly point: LonLatDeg } | null;
  /**
   * The focused body's geometry `surfaceDragRotation` (§4.4) needs to solve a
   * cursor-anchored drag — `bodyOrientation`, `bodyCentreMpc`, `radiusMpc`,
   * plus `bodyId` so the orbit branch can confirm the point grabbed at
   * gesture start is still ON the currently focused body (focus can change
   * mid-drag). `null` when no body is focused, mirroring `pivotRadiusMpc`'s
   * null convention.
   *
   * A separate getter rather than folding this into `hoveredSurfacePoint`:
   * the hover getter answers "where is the cursor NOW" (read every
   * pointermove regardless of drag state), this answers "what body geometry
   * is the live grab measured against" (read only inside an active orbit
   * drag with a captured grab) — same "one getter per question" split
   * `pivotRadiusMpc` vs `hoveredSurfacePoint` already established, and it
   * keeps the identity check (`frame.bodyId === grabbedPoint.bodyId`)
   * self-contained in the orbit branch rather than threading a second live
   * read of `hoveredSurfacePoint` through it.
   */
  dragPivotFrame?: () => {
    readonly bodyId: BodyId;
    readonly bodyOrientation: Mat3;
    readonly bodyCentreMpc: Vec3;
    readonly radiusMpc: number;
  } | null;
  /**
   * Called whenever `nextZoomBiasAnchor` produces a value — every wheel tick
   * and at pinch-start — with the resulting anchor (or `null`). Idempotent
   * when the anchor is unchanged (the module re-fires the same reference
   * rather than skipping the call). The engine wires this to
   * `state.picking.zoomBiasAnchor`; see that field's docblock for the
   * read-time "clears on focus change" gate downstream consumers apply.
   */
  onZoomBiasAnchor?: (
    anchor: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null,
  ) => void;
  /**
   * Called on the first pointer contact that begins a new gesture (i.e. when
   * `activePointers.size === 1` on `pointerdown`). Subsequent fingers (pinch
   * promotion) do NOT re-fire this.
   *
   * The engine uses this to:
   *   1. Seed the drag register (`state.cam`) from the live produced pose so
   *      a mid-animation grab continues from exactly where the tween left the
   *      camera.
   *   2. Dispatch `beginDrag()` to the Redux store so the `orbitDrag` driver
   *      becomes active (priority 80, outranking any in-flight tween or
   *      auto-rotate).
   *   3. Dispatch `cancelCameraTween()` to cancel any in-flight tween.
   */
  onGestureStart?: () => void;
  /**
   * Called when ALL active pointers have been released (i.e. when
   * `activePointers.size === 0` on `pointerup`).
   *
   * The engine uses this to commit the gesture's final camera pose into the
   * Redux store (`commitCameraPose`) and then dispatch `endDrag()`. The commit
   * happens BEFORE `endDrag` so the baked pose is already in `base` the moment
   * the `orbitDrag` driver deactivates on the next frame — no one-frame
   * snap-back to the pre-gesture base.
   */
  onGestureEnd?: () => void;
  /**
   * Called whenever `dragMode`, `activePointers`, or the last wheel event
   * changes — DebugPanel-only scaffolding for the Camera section (the
   * "dragging also zooms" investigation). Fires on pointerdown/up and every
   * wheel tick, never on pointermove — the debug read doesn't need
   * per-pixel resolution, and hooking a callback into that hot path isn't
   * worth it for a debug-only consumer.
   */
  onDebugSample?: (sample: OrbitControlsDebugSample) => void;
};
