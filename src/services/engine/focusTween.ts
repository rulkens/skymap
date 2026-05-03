/**
 * focusTween — constants and helpers for the focus-on-galaxy camera tween.
 *
 * The engine offers two camera tweens — `focusOn(worldXYZ)` and `focusOnHome()`
 * — both of which share a common duration (600 ms, a sweet spot the UI
 * settled on) and, for `focusOn`, a target distance derived from a "typical"
 * galaxy diameter.
 *
 * These values are pulled out into their own module so the magic numbers
 * (600 ms, 30 kpc, ×4 multiplier) are documented once, in one place, rather
 * than scattered through `engine.ts`.  When the upcoming `galaxyDiameterKpc`
 * helper lands the only file that needs to change is this one.
 */

/**
 * Tween duration for focus / home camera moves, in milliseconds.
 *
 * 600 ms is the sweet spot the UI explored: long enough that the user reads it
 * as motion (not a teleport) and gets oriented in the new frame, short enough
 * that it never feels sluggish during rapid clicking through the InfoCard list.
 */
export const FOCUS_TWEEN_MS = 600;

/**
 * Diameter of a "typical" galaxy, in kiloparsecs.
 *
 * A sibling plan is landing a `galaxyDiameterKpc(point)` helper that derives
 * a per-galaxy diameter from photometry; until that lands we use a constant.
 * 30 kpc is roughly the diameter of the Milky Way's stellar disc — a sane
 * placeholder that puts the camera at a "naked-eye" distance from any galaxy.
 */
const FOCUS_GALAXY_DIAMETER_KPC = 30;

/**
 * Convert kpc → Mpc (1 Mpc = 1000 kpc) so the focus distance lives in the
 * same units as `cam.distance`.  This factor is used once below; we name it
 * to keep the math in `focusDistanceMpc` self-documenting.
 */
const KPC_PER_MPC = 1000;

/**
 * Focus distance multiplier — how many galaxy diameters away from the target
 * we want to sit.  4× a 30 kpc disc is 120 kpc = 0.12 Mpc, which is a good
 * "see the whole galaxy with a little space around it" framing.
 */
const FOCUS_DIAMETER_MULTIPLIER = 4;

/**
 * Compute the focus camera distance for a galaxy.
 *
 * Currently a constant (4 × 30 kpc = 120 kpc = 0.12 Mpc) but factored as a
 * function so the upcoming per-galaxy diameter helper can drop in cleanly.
 */
export function focusDistanceMpc(): number {
  return (FOCUS_DIAMETER_MULTIPLIER * FOCUS_GALAXY_DIAMETER_KPC) / KPC_PER_MPC;
}
