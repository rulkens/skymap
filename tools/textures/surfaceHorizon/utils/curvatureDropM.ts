/** curvatureDropM — how far the datum sphere falls below the tangent plane at arc distance
 *  `distanceM`: d²/2R, the small-angle form the spec fixes (spec §4). */
export function curvatureDropM(distanceM: number, radiusM: number): number {
  return (distanceM * distanceM) / (2 * radiusM);
}
