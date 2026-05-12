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
   * A "click" is defined as a pointerup that occurred within 4 CSS pixels of
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
   * We delegate the "two clicks within the OS-defined time + distance
   * threshold" detection to the browser's native `dblclick` event rather
   * than rolling our own timer.  The browser already follows the user's
   * accessibility/sensitivity preferences, and on touch screens the same
   * event fires for a quick double-tap — no extra branching here.
   *
   * Note: native `dblclick` fires AFTER both `click` events, so any
   * `onClick` handler will have already run twice.  That's intentional —
   * the engine wires single-click to "select" and double-click to
   * "focus", and a double-click cleanly upgrades a selection into a
   * focus tween without missing either step.
   */
  onDoubleClick?: (xCss: number, yCss: number) => void;
  /**
   * Called every time the camera state has been mutated by this module
   * (any pointer drag, pan, or wheel zoom).  The engine routes this
   * into its render scheduler so a single user gesture wakes the
   * render loop for one frame.
   *
   * Optional for backwards compatibility with callers that don't yet
   * use render-on-demand — those will simply not get the callback and
   * the loop will need to be ticking via some other mechanism.
   *
   * Fired AFTER `updatePosition(cam)` so the camera state is fully
   * settled before the engine reads it for the next frame.
   */
  onCameraChange?: () => void;
};
