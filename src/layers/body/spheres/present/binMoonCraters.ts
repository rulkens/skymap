/**
 * binMoonCraters — which of the picked rings can reach each of the frame's
 * `ANTIQUE_MOON_TILES`: a bit per ring (its order in `picked`) in two u32 per tile,
 * written into `out`, so the Moon passes loop over a pixel's few rings, not all of them
 * (all 40 cost a close-up ~17 ms a frame at dpr 2). A ring reaches its rim's flank, a named
 * crater's mark at least `ANTIQUE_MOON_NAMED_REACH_COS`, a sea crater's blanket, a rayed
 * crater's ejecta. The
 * bound is the reach's small-angle size at the centre's distance, grown by REACH_MARGIN
 * for the perspective stretch off the axis. Returns one tile's size, device px.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonCraterView } from '../@types/MoonCraterView';
import {
  ANTIQUE_MOON_BLANKET,
  ANTIQUE_MOON_EJECTA,
  ANTIQUE_MOON_NAMED_REACH_COS,
  ANTIQUE_MOON_RIM_REACH,
  ANTIQUE_MOON_TILES,
} from '../data/antiqueMoonPrint';

const REACH_MARGIN = 1.6;
const NAMED_REACH = Math.acos(ANTIQUE_MOON_NAMED_REACH_COS);

export function binMoonCraters(
  table: MoonCraterTable,
  picked: readonly number[],
  view: MoonCraterView,
  named: ReadonlySet<number>,
  onSea: ReadonlySet<number>,
  out: Uint32Array,
): readonly [number, number] {
  const [cols, rows] = ANTIQUE_MOON_TILES;
  const tileW = Math.ceil(view.widthPx / cols);
  const tileH = Math.ceil(view.heightPx / rows);
  const m = view.mvp;
  const [ex, ey, ez] = view.eye;
  out.fill(0);
  picked.forEach((i, bit) => {
    const cx = table.centres[3 * i]!;
    const cy = table.centres[3 * i + 1]!;
    const cz = table.centres[3 * i + 2]!;
    const w = m[3]! * cx + m[7]! * cy + m[11]! * cz + m[15]!;
    if (w <= 0) return;
    const x = (0.5 + (0.5 * (m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!)) / w) * view.widthPx;
    const y = (0.5 - (0.5 * (m[1]! * cx + m[5]! * cy + m[9]! * cz + m[13]!)) / w) * view.heightPx;
    const rho = table.rho[i]!;
    let reach = ANTIQUE_MOON_RIM_REACH * rho;
    if (named.has(i)) reach = Math.max(reach, NAMED_REACH);
    if (table.weight[i]! > 1) reach = Math.max(reach, ANTIQUE_MOON_EJECTA[1] * rho);
    if (onSea.has(i)) reach = Math.max(reach, ANTIQUE_MOON_BLANKET[1] * rho);
    const r = (REACH_MARGIN * reach * view.pxPerRad) / Math.hypot(cx - ex, cy - ey, cz - ez) + 2;
    const c0 = Math.max(0, Math.floor((x - r) / tileW));
    const c1 = Math.min(cols - 1, Math.floor((x + r) / tileW));
    const r0 = Math.max(0, Math.floor((y - r) / tileH));
    const r1 = Math.min(rows - 1, Math.floor((y + r) / tileH));
    const word = bit >> 5;
    const flag = (1 << (bit & 31)) >>> 0;
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) out[2 * (row * cols + col) + word]! |= flag;
  });
  return [tileW, tileH];
}
