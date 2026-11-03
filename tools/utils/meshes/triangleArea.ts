/**
 * triangleArea — area of the triangle on vertices `a`, `b`, `c` (vertex indices, not float
 * offsets) of a packed xyz `positions` array: half the cross product's length.
 */

export function triangleArea(
  positions: ArrayLike<number>,
  a: number,
  b: number,
  c: number,
): number {
  const ux = positions[3 * b]! - positions[3 * a]!;
  const uy = positions[3 * b + 1]! - positions[3 * a + 1]!;
  const uz = positions[3 * b + 2]! - positions[3 * a + 2]!;
  const vx = positions[3 * c]! - positions[3 * a]!;
  const vy = positions[3 * c + 1]! - positions[3 * a + 1]!;
  const vz = positions[3 * c + 2]! - positions[3 * a + 2]!;
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}
