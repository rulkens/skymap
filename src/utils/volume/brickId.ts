import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';

/** A brick's archive key, x fastest, then y, then z: the order its entries sort in on R2. */
export function brickId(coords: Readonly<Vec3>, grid: Readonly<Vec3>): number {
  return coords[0] + grid[0] * (coords[1] + grid[1] * coords[2]);
}
