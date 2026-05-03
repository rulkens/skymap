/**
 * focusTween — constants and helpers for the focus-on-galaxy camera tween.
 *
 * The engine offers two camera tweens — `focusOn(worldXYZ)` and
 * `focusOnHome()` — both sharing a 600 ms duration and, for `focusOn`,
 * a target distance derived from the galaxy's physical diameter.
 *
 * Why expose the diameter as an argument now?  Earlier versions used a
 * project-wide 30 kpc placeholder, which framed dwarfs too far away (the
 * camera looked like it had stopped short) and giants too close (the
 * camera ended up inside the disk).  v4 binary format gives every galaxy
 * its real diameter; this helper now accepts it so the framing matches
 * each galaxy's actual size.
 */

/**
 * Tween duration for focus / home camera moves, in milliseconds.
 *
 * 600 ms is the sweet spot the UI explored: long enough that the user reads
 * it as motion (not a teleport) and gets oriented in the new frame, short
 * enough that it never feels sluggish during rapid clicking through the
 * InfoCard list.
 */
export const FOCUS_TWEEN_MS = 600;

/** Convert kpc → Mpc (1 Mpc = 1000 kpc). */
const KPC_PER_MPC = 1000;

/**
 * Focus distance multiplier — how many galaxy diameters away from the
 * target we want to sit.  4× a 30 kpc disk is 120 kpc = 0.12 Mpc, a good
 * "see the whole galaxy with a little space around it" framing that
 * scales naturally as we plug in a real diameter.
 */
const FOCUS_DIAMETER_MULTIPLIER = 4;

/**
 * Fallback diameter when the caller doesn't supply one (or supplies a
 * non-finite / non-positive value).  Matches the pre-v4 placeholder so
 * existing call paths keep their previous framing exactly.
 */
const FALLBACK_DIAMETER_KPC = 30;

/**
 * Compute the focus-tween target distance for a galaxy of the given
 * physical diameter.
 *
 * Returns 0.12 Mpc (4 × 30 kpc) when `diameterKpc` is missing or
 * non-finite, matching the prior placeholder constant exactly.  Callers
 * without a diameter on hand can simply omit the argument.
 */
export function focusDistanceMpc(diameterKpc?: number): number {
  const d =
    diameterKpc !== undefined && Number.isFinite(diameterKpc) && diameterKpc > 0
      ? diameterKpc
      : FALLBACK_DIAMETER_KPC;
  return (FOCUS_DIAMETER_MULTIPLIER * d) / KPC_PER_MPC;
}
