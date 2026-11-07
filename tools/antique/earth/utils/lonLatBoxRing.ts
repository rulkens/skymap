/** lonLatBoxRing — a lon/lat box as a ring (west, south, east, north degrees), for hand-drawn realm data. */

export function lonLatBoxRing(
  west: number,
  south: number,
  east: number,
  north: number,
): (readonly [number, number])[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}
