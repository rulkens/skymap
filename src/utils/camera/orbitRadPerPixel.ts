/**
 * orbitRadPerPixel — yaw/pitch sensitivity of an orbit drag, radians per CSS
 * pixel — what the drag falls back to whenever the exact cursor-anchored solve
 * (`surfaceDragRotation`) declines to answer.
 *
 * A flat rate rotates the world about the target's CENTRE, so the ground it
 * sweeps scales with the pivot's radius, not altitude — at 127 km over Earth
 * (illustrative only; the `SURFACE_STANDOFF_RADII` floor sits far lower) a
 * flat-rate pixel sweeps ~350x the ground the screen actually spans.
 * `groundTrackingRadPerPixel` rates the drag against the ground instead (its
 * header carries the derivation), capped here at `ORBIT_MAX_RAD_PER_PX`, the
 * old flat rate: the two terms cross at ~7 body radii of altitude, so deep
 * space is unchanged above that and the drag slows continuously below it.
 * Either `altitudeMpc` or `pivotRadiusMpc` being `null` (no surface)
 * degenerates to the flat rate exactly.
 *
 * Correct only at SCREEN CENTRE, and only below the cap.
 */

import { groundTrackingRadPerPixel } from './groundTrackingRadPerPixel';

/** Flat-rate ceiling, radians per CSS pixel: 0.005 rad/px, a 100 px drag ~28.6°. */
export const ORBIT_MAX_RAD_PER_PX = 0.005;

/**
 * Orbit-drag sensitivity for the current gesture, radians per CSS pixel.
 *
 * @param fovYRad         Vertical field of view, radians.
 * @param altitudeMpc     Camera's EYE-based altitude above the orbit pivot's
 *   surface, Mpc, or `null` when there is no pivot to measure against.
 * @param cssHeight       Canvas CSS height, pixels.
 * @param pivotRadiusMpc  Orbit pivot's physical radius, Mpc, or `null` when it
 *   has no surface to damp against.
 */
export function orbitRadPerPixel(
  fovYRad: number,
  altitudeMpc: number | null,
  cssHeight: number,
  pivotRadiusMpc: number | null,
): number {
  if (altitudeMpc === null || pivotRadiusMpc === null) return ORBIT_MAX_RAD_PER_PX;
  if (altitudeMpc <= 0) return ORBIT_MAX_RAD_PER_PX;

  return Math.min(
    ORBIT_MAX_RAD_PER_PX,
    groundTrackingRadPerPixel(fovYRad, altitudeMpc, cssHeight, pivotRadiusMpc),
  );
}
