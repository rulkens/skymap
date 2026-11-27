import type { Vec3 } from '../../@types/math/Vec3';

/** The inverse of `brickId`. */
export function brickCoordsOf(id: number, grid: Readonly<Vec3>): Vec3 {
  const [nx, ny] = grid;
  return [id % nx, Math.floor(id / nx) % ny, Math.floor(id / (nx * ny))];
}
