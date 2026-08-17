/**
 * orbitRadPerPixel — yaw/pitch sensitivity of an orbit drag, radians per CSS
 * pixel, damped by altitude above a focused body's surface.
 *
 * A flat rate rotates the world about the target's CENTRE, so the ground it
 * sweeps scales with the pivot's radius, not altitude — at Earth's standoff
 * floor (127 km, `SURFACE_STANDOFF_RADII`) a flat-rate pixel sweeps ~350x the
 * ground the screen actually spans.
 *
 * `2 * tan(fovYRad / 2) * h / (cssHeight * pivotRadiusMpc)`, where
 * `h = distance - pivotRadiusMpc`, rates the drag against the ground instead —
 * the pan path's `pxToWorld` conversion (`orbitControls.ts`) evaluated at
 * altitude rather than `distance` (pan moves the TARGET, an orbit drag sweeps
 * the GROUND), divided by the pivot's radius to convert world distance into
 * radians of rotation.
 *
 * Capped at `ORBIT_MAX_RAD_PER_PX`, the old flat rate: the two terms cross at
 * ~7 body radii of altitude, so deep space is unchanged above that and the
 * drag slows continuously below it. `pivotRadiusMpc === null` (no surface)
 * degenerates to the flat rate exactly.
 *
 * Correct only at SCREEN CENTRE — an exact fix needs a cursor-to-surface
 * raycast that doesn't exist in this codebase yet (deferred,
 * `docs/backlog/2026-07-30-surface-directed-zoom.md`).
 */

/** Flat-rate ceiling, radians per CSS pixel: 0.005 rad/px, a 100 px drag ~28.6°. */
export const ORBIT_MAX_RAD_PER_PX = 0.005;

/**
 * Orbit-drag sensitivity for the current gesture, radians per CSS pixel.
 *
 * @param fovYRad         Vertical field of view, radians.
 * @param distance        Camera distance to the orbit target, Mpc.
 * @param cssHeight       Canvas CSS height, pixels.
 * @param pivotRadiusMpc  Orbit pivot's physical radius, Mpc, or `null` when it
 *   has no surface to damp against.
 */
export function orbitRadPerPixel(
  fovYRad: number,
  distance: number,
  cssHeight: number,
  pivotRadiusMpc: number | null,
): number {
  if (pivotRadiusMpc === null) return ORBIT_MAX_RAD_PER_PX;

  const h = distance - pivotRadiusMpc;
  if (h <= 0) return ORBIT_MAX_RAD_PER_PX;

  const groundTrackingRate = (2 * Math.tan(fovYRad / 2) * h) / (cssHeight * pivotRadiusMpc);
  return Math.min(ORBIT_MAX_RAD_PER_PX, groundTrackingRate);
}
