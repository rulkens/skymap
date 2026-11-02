/**
 * bodyFocusDistance — framing-distance helper for seeded scene bodies (Earth,
 * later stars/planets). Companion to `galaxyFocusDistance.ts` and
 * `structureFocusDistance.ts`.
 *
 * ### Same screen-fill derivation as structureFocusDistance, different regime
 *
 * The math is the structure helper's angular formula:
 *
 *   apparentRadiusPx = (R / distance) · pxPerRad
 *   distance         = R / (FOCUS_FILL · tan(fovY / 2))
 *   ⇒ apparentRadiusPx = FOCUS_FILL · (viewportHeight / 2)
 *
 * so one fill factor frames every body to the same on-screen size regardless
 * of its physical radius — Earth (6371 km) and a future star both land with
 * the same viewport footprint.
 *
 * ### Why NOT reuse structureFocusDistance directly
 *
 * Both existing helpers carry Mpc-scale clamps (0.15 Mpc galaxy floor,
 * [0.1, 800] Mpc structure band) tuned for objects the catalog renders at
 * cosmological distances. A planet's radius is ~2e-16 Mpc — ANY Mpc-scale
 * floor swallows the framing entirely and parks the camera ~5e14 body-radii
 * away. So this helper is deliberately clamp-free pure math; the deep-zoom
 * descent's own distance clamp (not this function) owns "how close is too
 * close".
 *
 * ### Fill choice
 *
 * Structures use FILL 2.2 (overflow, so the marker ring has faded); a body is
 * the OPPOSITE intent — you flew here to look at it. 0.4 puts the sphere's
 * apparent diameter at ~40% of the viewport height: dominant, with sky margin.
 */

/** Apparent body radius at focus, as a multiple of the half-viewport-height. */
const BODY_FOCUS_FILL = 0.4;

/**
 * Camera-target distance (Mpc) framing a body of physical radius `radiusMpc`
 * to a fixed fraction of the viewport, given the vertical FOV in radians.
 * Pure and unclamped — scales linearly with the radius at every magnitude.
 */
export function bodyFocusDistance(radiusMpc: number, fovYRad: number): number {
  return radiusMpc / (BODY_FOCUS_FILL * Math.tan(fovYRad / 2));
}
