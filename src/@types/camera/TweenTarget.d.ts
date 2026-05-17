/**
 * TweenTarget — the minimum-surface descriptor `tweenToGalaxy` actually
 * consumes.
 *
 * The helper only reads four fields off the target: `x`, `y`, `z`, and
 * `diameterKpc`.  Declaring the parameter as `GalaxyInfo` would imply
 * the helper might reach for ra/dec/redshift/etc., which it never does.
 * The minimum-surface type doubles as documentation: "this is exactly
 * the data the tween needs."  Production callers pass a full
 * `GalaxyInfo` and TypeScript accepts it via structural compatibility.
 */

export type TweenTarget = {
  /** World-space X in Mpc. */
  x: number;
  /** World-space Y in Mpc. */
  y: number;
  /** World-space Z in Mpc. */
  z: number;
  /**
   * Physical galaxy diameter in kpc — drives the focus distance via
   * `focusDistanceMpc`.  Callers that genuinely lack a diameter (none
   * today) should pass the project-wide fallback explicitly rather
   * than letting NaN through.
   */
  diameterKpc: number;
};
