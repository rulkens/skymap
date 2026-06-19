/**
 * OrbitControlsOptions — optional configuration for `attachOrbitControls`.
 *
 * All fields are optional — omitting the object entirely gives the same
 * behaviour as the original single-argument overload (orbit only, no click).
 */

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
   * pointer drag, pan, or wheel zoom). The engine routes this into its render
   * scheduler so a single user gesture wakes the render loop for one frame.
   *
   * This replaces `onCameraChange` as the canonical wake callback. The engine
   * wires `onChange` to `scheduler.requestRender()` and passes `onGestureStart`
   * / `onGestureEnd` for Redux bookkeeping around gesture boundaries.
   *
   * Optional for backwards compatibility — callers that have not migrated from
   * `onCameraChange` yet still function; Phase 5 removes `onCameraChange`.
   *
   * Fired AFTER `updatePosition(cam)` so the camera state is fully settled
   * before the engine reads it for the next frame.
   */
  onChange?: () => void;
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
   * Called every time the camera state has been mutated by this module.
   *
   * @deprecated Use `onChange` instead. This field has no fire sites as of the
   *   camera cutover and will be removed in Phase 5 when the App auto-rotate
   *   toggle relocates to the camera slice. Kept here only to avoid a type
   *   churn in the same commit; passing it has no effect.
   */
  onCameraChange?: () => void;
};
