/** The ratio is clamped to 1 so a point inside the sphere gives π/2, not NaN. */
export function angularRadiusRad(radiusM: number, distanceM: number): number {
  return Math.asin(Math.min(1, radiusM / distanceM));
}
