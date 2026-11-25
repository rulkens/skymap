/** curvatureDropM — the datum's fall below the tangent plane at arc distance d: d²/2R (spec §4). */
export function curvatureDropM(distanceM: number, radiusM: number): number {
  return (distanceM * distanceM) / (2 * radiusM);
}
