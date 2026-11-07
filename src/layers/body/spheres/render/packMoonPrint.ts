/**
 * packMoonPrint — the `MoonPrint` uniform of `texturedBody/fragment.wesl`: count (u32),
 * unit (device px per print unit), focalPx, the sphere's radius (m), the tile size (px),
 * a pad; then per crater c.xyz, rho (rad), weight, cos of its reach, 1 if the look names
 * it, 1 if it was thrown on a sea; then the tiles' ring masks. The reach's cosine is
 * taken here, once per crater, not per fragment.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonPrintFrame } from '../@types/MoonPrintFrame';
import { ANTIQUE_MOON_MAX_CRATERS, ANTIQUE_MOON_RIM_REACH } from '../data/antiqueMoonPrint';

export function packMoonPrint(
  table: MoonCraterTable,
  picked: readonly number[],
  frame: MoonPrintFrame,
  out: ArrayBuffer,
  named: ReadonlySet<number> = new Set(),
  onSea: ReadonlySet<number> = new Set(),
): ArrayBuffer {
  const f = new Float32Array(out);
  const u = new Uint32Array(out);
  u[0] = picked.length;
  f[1] = frame.unitPx;
  f[2] = frame.focalPx;
  f[3] = frame.radiusM;
  f[4] = frame.tilePx[0];
  f[5] = frame.tilePx[1];
  picked.forEach((i, k) => {
    const o = 8 + 8 * k;
    f[o] = table.centres[3 * i]!;
    f[o + 1] = table.centres[3 * i + 1]!;
    f[o + 2] = table.centres[3 * i + 2]!;
    f[o + 3] = table.rho[i]!;
    f[o + 4] = table.weight[i]!;
    f[o + 5] = Math.cos(ANTIQUE_MOON_RIM_REACH * table.rho[i]!);
    f[o + 6] = named.has(i) ? 1 : 0;
    f[o + 7] = onSea.has(i) ? 1 : 0;
  });
  u.set(frame.tiles, 8 + 8 * ANTIQUE_MOON_MAX_CRATERS);
  return out;
}
