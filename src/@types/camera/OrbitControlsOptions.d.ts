/**
 * OrbitControlsOptions — the non-camera callbacks `attachOrbitControls` takes.
 *
 * Camera motion does not appear here: it leaves the recognizer as
 * `InputGestureEvent`s through the `emit` sink. These two are selection
 * concerns that need no aggregation, so they stay direct callbacks.
 */

export type OrbitControlsOptions = {
  /**
   * Fires on a pointerup within 4 CSS pixels of its pointerdown — the
   * threshold that separates an intentional tap from the jitter preceding a
   * drag. Coordinates are CSS pixels (`e.clientX` / `e.clientY`).
   */
  onClick?: (xCss: number, yCss: number) => void;
  /**
   * Fires on the browser's native `dblclick`, which already honours the OS
   * threshold and fires for a double-tap on touch screens.
   *
   * Note: `dblclick` fires AFTER both `click`s, so `onClick` has already run
   * twice. That is intentional — single-click selects, double-click upgrades
   * that selection to focus, and neither step is missed.
   */
  onDoubleClick?: (xCss: number, yCss: number) => void;
};
