/**
 * packMoonPrint — the `MoonPrint` uniform of `texturedBody/fragment.wesl`: count (u32),
 * unit (device px per print unit), focalPx, the sphere's radius (m); then per crater c.xyz, rho (rad),
 * weight, cos of its reach, 1 if the look names it, a pad. The reach's cosine is taken here, once per
 * crater, not per fragment.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import { ANTIQUE_MOON_RIM_REACH } from '../data/antiqueMoonPrint';

export function packMoonPrint(
  table: MoonCraterTable,
  picked: readonly number[],
  unitPx: number,
  focalPx: number,
  radiusM: number,
  out: ArrayBuffer,
  named: ReadonlySet<number> = new Set(),
): ArrayBuffer {
  const f = new Float32Array(out);
  new Uint32Array(out)[0] = picked.length;
  f[1] = unitPx;
  f[2] = focalPx;
  f[3] = radiusM;
  picked.forEach((i, k) => {
    const o = 4 + 8 * k;
    f[o] = table.centres[3 * i]!;
    f[o + 1] = table.centres[3 * i + 1]!;
    f[o + 2] = table.centres[3 * i + 2]!;
    f[o + 3] = table.rho[i]!;
    f[o + 4] = table.weight[i]!;
    f[o + 5] = Math.cos(ANTIQUE_MOON_RIM_REACH * table.rho[i]!);
    f[o + 6] = named.has(i) ? 1 : 0;
  });
  return out;
}
