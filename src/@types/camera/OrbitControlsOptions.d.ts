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
   * Called every time the camera state has been mutated by this module (an
   * orbit or pan drag). The engine wires this to `scheduler.requestRender()` so
   * a single user gesture wakes the render loop for one frame; `onZoom` wakes
   * it for zoom ticks, which this module no longer applies itself, and
   * `onGestureStart` / `onGestureEnd` carry the Redux bookkeeping around
   * gesture boundaries.
   *
   * Fired AFTER `updatePosition(cam)` so the camera state is fully settled
   * before the engine reads it for the next frame.
   */
  onChange?: () => void;
  /**
   * Called for EVERY zoom tick — wheel notch or pinch step — with the
   * multiplicative factor (e^(deltaY·k) for a wheel, the pinch-distance ratio
   * for a pinch) and the CSS-pixel cursor the tick is anchored on (the pinch
   * midpoint for a pinch).
   *
   * The engine owns the whole zoom: it resolves the surface point under that
   * cursor, converts the factor into pose motion (`cursorZoomStep`), and routes
   * the result to whichever register renders the camera this frame — the drag
   * register mid-gesture, the store `base` / follow slot at rest. This module
   * cannot make that call: it sees neither the scene geometry the anchor needs
   * nor the driver arbitration that decides which register is live.
   */
  onZoom?: (factor: number, cursorCss: { readonly x: number; readonly y: number }) => void;
  /**
   * Physical radius (Mpc) of whatever the camera currently orbits, or `null`
   * when the pivot has no surface. Feeds the orbit-drag rate's ground-tracking
   * denominator (`orbitRadPerPixel`).
   *
   * A getter, not a cached value — this module holds no scene state; the
   * engine wires it to `pivotRadiusMpc(selectFocusRow(...))`. Omitted
   * (tests, or no scene) ⇒ the flat rate applies.
   */
  pivotRadiusMpc?: () => number | null;
  /**
   * The camera's live EYE-based altitude (Mpc) above whatever it currently
   * orbits, or `null` when the pivot has no surface — `eyeAltitudeMpc`, not a
   * `distance − pivotRadiusMpc` shortcut (see that util's header for why the
   * shortcut drifts once `cam.target` isn't pinned exactly to the pivot
   * centre: a pan strafe, or a future zoom-to-cursor). Feeds the pan
   * gesture's `pxToWorld` conversion and the orbit-drag rate's altitude term
   * (`orbitRadPerPixel`) — the two READ sites this task migrates off
   * `pivotRadiusMpc`; the zoom paths (pinch, wheel) keep reading
   * `pivotRadiusMpc` above, unchanged.
   *
   * A getter, not a cached value — same shape as `pivotRadiusMpc`: this
   * module holds no scene state, so the engine wires it to a live read of
   * `cam.position` against the focused row's live centre. Omitted (tests, or
   * no scene) ⇒ both READ sites fall back to their pre-fix flat/raw-distance
   * formula.
   */
  pivotAltitudeMpc?: () => number | null;
  /**
   * The cursor's current surface hit against the focused body — `{ bodyId,
   * point }` in that body's local lon/lat — or `null` when nothing has ever
   * hit / no body is focused. A getter, not a cached value — mirrors
   * `pivotRadiusMpc`'s shape: this module holds no scene state, so the
   * engine wires it to a live read of `state.picking.hoveredSurfacePoint`.
   * Consumed by the drag-grab capture (§4.4, `dragPivotFrame` below); zoom
   * re-picks its own anchor per tick and never reads this.
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
    /**
     * The orbit target the frame loop will actually render this focus around —
     * `bodyCentreMpc + clock.followPanOffset` — or `null` when the focus is not
     * pivot-pinned (a static body keeps its committed target). The drag
     * register's own `target` is seeded once at gesture start, so mid-gesture
     * it is stale by exactly the pin: the body's motion since, plus any zoom
     * lateral the offset absorbed. The solve reads this instead; nothing about
     * the register's target WRITES changes (`accumulateFollowPan` diffs them).
     */
    readonly pinnedTargetMpc: Vec3 | null;
  } | null;
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
