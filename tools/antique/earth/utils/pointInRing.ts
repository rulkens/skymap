/** pointInRing — even-odd test of a lon/lat point against a ring, in plain degrees: fine for the
 * small hand-drawn rings of the realm data, which never cross the antimeridian. */

export function pointInRing(
  point: readonly [number, number],
  ring: readonly (readonly [number, number])[],
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
