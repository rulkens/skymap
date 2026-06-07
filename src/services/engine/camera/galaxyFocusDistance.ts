/**
 * galaxyFocusDistance — camera framing-distance derivation for galaxy
 * focus tweens.  Companion to `structureFocusDistance.ts`; tween duration
 * lives in `focusTweenDuration.ts`.
 *
 * The galaxy's physical diameter drives the framing.  v4 binary format
 * carries per-galaxy diameters, so we derive the distance per-target.
 */

/** Convert kpc → Mpc (1 Mpc = 1000 kpc). */
const KPC_PER_MPC = 1000;

/**
 * Focus distance multiplier — how many galaxy diameters away from the
 * target we want to sit.  8× a 30 kpc disk is 240 kpc = 0.24 Mpc, a
 * "see the whole galaxy with a comfortable margin" framing that scales
 * naturally as we plug in a real diameter.  Bumped from the 4× placeholder
 * the constant-diameter version used: with real per-galaxy sizes, dwarfs
 * land far closer than 30 kpc, and 4× their size left the camera inside
 * the disk at the end of the tween.
 */
const FOCUS_DIAMETER_MULTIPLIER = 8;

/**
 * Fallback diameter when the caller doesn't supply one (or supplies a
 * non-finite / non-positive value).
 */
const FALLBACK_DIAMETER_KPC = 30;

/**
 * Minimum focus-tween target distance, in Mpc.
 *
 * Below this the camera ends up uncomfortably close to even a tiny dwarf —
 * the on-screen footprint of the disk balloons past the viewport and the
 * surrounding context disappears.  0.15 Mpc keeps a sensible field-of-view
 * regardless of the galaxy's physical size.  The renderer's near plane
 * (engine.ts: 0.01 Mpc) and the wheel-zoom floor (orbitCamera.ts: 0.05
 * Mpc) sit well below this so manual zoom can still get closer if the
 * user wants.
 */
const MIN_FOCUS_DISTANCE_MPC = 0.15;

/**
 * Compute the focus-tween target distance for a galaxy of the given
 * physical diameter.
 *
 * Returns 0.24 Mpc for a 30 kpc fallback diameter, scales upward with
 * `diameterKpc`, and is clamped to MIN_FOCUS_DISTANCE_MPC so dwarf
 * galaxies don't end up with the camera inside their disk.  Callers
 * without a diameter on hand can simply omit the argument.
 */
export function galaxyFocusDistance(diameterKpc?: number): number {
  const d =
    diameterKpc !== undefined && Number.isFinite(diameterKpc) && diameterKpc > 0
      ? diameterKpc
      : FALLBACK_DIAMETER_KPC;
  const raw = (FOCUS_DIAMETER_MULTIPLIER * d) / KPC_PER_MPC;
  return Math.max(raw, MIN_FOCUS_DISTANCE_MPC);
}
