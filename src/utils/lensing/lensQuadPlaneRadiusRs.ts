/**
 * Lens-billboard half-size in r_s reaching `edgeFadeEndRs` at anchor distance
 * `distRs`: R = b·d/√(d²−b²). In f64 HERE because in f32 in the vertex stage
 * it degenerated as b → d, inflating the quad ~5e4× and shaking every ray.
 * The cap bounds that regime (b/d > 8/√65 ≈ 0.992, half-angle ≈ 83°).
 */
const QUAD_RADIUS_CAP = 8;

export function lensQuadPlaneRadiusRs(edgeFadeEndRs: number, distRs: number): number {
  const capRs = QUAD_RADIUS_CAP * distRs;
  const discriminant = distRs * distRs - edgeFadeEndRs * edgeFadeEndRs;
  if (discriminant <= 0) return capRs;
  return Math.min((edgeFadeEndRs * distRs) / Math.sqrt(discriminant), capRs);
}
