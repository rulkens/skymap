/** greatCircleKm — haversine distance between two lon/lat points (degrees). */

const RAD = Math.PI / 180;

export function greatCircleKm(
  a: readonly [number, number],
  b: readonly [number, number],
  radiusKm: number,
): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}
