/**
 * lensQuadPlaneRadiusRs — half-size (r_s units) of the camera-facing lens
 * billboard that covers impact parameters out to `edgeFadeEndRs` at anchor
 * distance `distRs`: a fragment at plane radius R rides a ray with
 * b = R·d/√(R²+d²), inverted here as R = b·d/√(d²−b²). Once b approaches or
 * exceeds d (the close-orbit regime, where the lutMax floor puts
 * edgeFadeEndRs ≥ distRs) the inversion degenerates — no billboard covers the
 * whole sky — and the shader that used to run this in f32 inflated the quad
 * ~5e4× the anchor distance, whose varying interpolation put ~3 mrad of
 * barycentric noise on every ray (the close-orbit shake, audit §9). Capped at
 * QUAD_RADIUS_CAP·d (half-angle atan(8) ≈ 83°, past any viewport
 * half-diagonal) and computed in f64 on the CPU, so the GPU only ever sees a
 * finished, smooth radius.
 */

/** Cap engages only when edgeFadeEndRs/distRs > 8/√65 ≈ 0.992 — reachable
 *  solely via the lutMax floor (distRs ≲ 50), where full fade coverage is
 *  impossible for any billboard anyway. */
const QUAD_RADIUS_CAP = 8;

export function lensQuadPlaneRadiusRs(edgeFadeEndRs: number, distRs: number): number {
  const capRs = QUAD_RADIUS_CAP * distRs;
  const discriminant = distRs * distRs - edgeFadeEndRs * edgeFadeEndRs;
  if (discriminant <= 0) return capRs;
  return Math.min((edgeFadeEndRs * distRs) / Math.sqrt(discriminant), capRs);
}
