/**
 * createSphereHash — a 3D grid of points on the unit sphere answering "is any
 * point closer than `chord`?". Hashing xyz rather than lon/lat means no
 * antimeridian or pole case: neighbours across either are neighbours in space.
 */

import type { Vec3 } from '../../../../src/@types/math/Vec3';

export function createSphereHash(chord: number): {
  add(p: Readonly<Vec3>): void;
  near(p: Readonly<Vec3>): boolean;
} {
  const k = Math.ceil(1 / chord) + 1;
  const side = 2 * k + 1;
  const cells = new Map<number, number[]>();
  const cellOf = (v: number) => Math.floor(v / chord) + k;
  const key = (x: number, y: number, z: number) => (x * side + y) * side + z;
  return {
    add(p) {
      const id = key(cellOf(p[0]), cellOf(p[1]), cellOf(p[2]));
      const cell = cells.get(id);
      if (cell) cell.push(p[0], p[1], p[2]);
      else cells.set(id, [p[0], p[1], p[2]]);
    },
    near(p) {
      const cx = cellOf(p[0]);
      const cy = cellOf(p[1]);
      const cz = cellOf(p[2]);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const cell = cells.get(key(cx + dx, cy + dy, cz + dz));
            if (!cell) continue;
            for (let i = 0; i < cell.length; i += 3) {
              const ex = p[0] - cell[i]!;
              const ey = p[1] - cell[i + 1]!;
              const ez = p[2] - cell[i + 2]!;
              if (ex * ex + ey * ey + ez * ez < chord * chord) return true;
            }
          }
      return false;
    },
  };
}
