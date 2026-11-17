/** ringAreaKm2 — area enclosed by a lon/lat ring on the sphere, unsigned (the spherical-excess
 * sum of Chamberlain & Duquette 2007, as d3-geo and turf use), km². */

const RAD = Math.PI / 180;

export function ringAreaKm2(ring: readonly (readonly [number, number])[], radiusKm: number): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[(i + 1) % ring.length]!;
    sum += (lon2 - lon1) * RAD * (2 + Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD));
  }
  return Math.abs((sum * radiusKm * radiusKm) / 2);
}
