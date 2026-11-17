/**
 * overlapShare — the share of one screen box (centre, half extents; a negative
 * half-width, a mirrored sprite, counts by its size) that lies inside another.
 */

export function overlapShare(
  centre: readonly [number, number],
  half: readonly [number, number],
  other: { centre: readonly [number, number]; half: readonly [number, number] },
): number {
  const hx = Math.abs(half[0]);
  const ox = Math.abs(other.half[0]);
  const w = Math.max(
    0,
    Math.min(centre[0] + hx, other.centre[0] + ox) - Math.max(centre[0] - hx, other.centre[0] - ox),
  );
  const h = Math.max(
    0,
    Math.min(centre[1] + half[1], other.centre[1] + other.half[1]) -
      Math.max(centre[1] - half[1], other.centre[1] - other.half[1]),
  );
  return (w * h) / (4 * hx * half[1]);
}
