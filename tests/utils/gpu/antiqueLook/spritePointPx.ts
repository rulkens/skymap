/**
 * spritePointPx — where an ornament instance prints a point of its sprite, in
 * screen px: through the instance's lattice as decor.wesl's vertex stage reads it
 * (bilinear in each cell), else as the flat turned quad.
 */

import type { AntiqueOrnamentInstance } from '../../../../src/@types/rendering/AntiqueOrnamentInstance';
import { ANTIQUE_ORNAMENT_GRID } from '../../../../src/data/rendering/antiqueLook';

export function spritePointPx(
  inst: AntiqueOrnamentInstance,
  u: number,
  v: number,
): [number, number] {
  if (inst.grid) {
    const n = ANTIQUE_ORNAMENT_GRID;
    const gx = Math.min(u * n, n - 1e-9);
    const gy = Math.min(v * n, n - 1e-9);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const at = (a: number, b: number) => inst.grid![b * (n + 1) + a]!;
    const out: [number, number] = [0, 0];
    for (const [da, db, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ] as const) {
      const p = at(i + da, j + db);
      out[0] += w * p[0];
      out[1] += w * p[1];
    }
    return out;
  }
  const lx = (2 * u - 1) * inst.halfPx[0];
  const ly = (2 * v - 1) * inst.halfPx[1];
  const c = Math.cos(inst.rotation);
  const s = Math.sin(inst.rotation);
  return [inst.centrePx[0] + c * lx + s * ly, inst.centrePx[1] - s * lx + c * ly];
}
