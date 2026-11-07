/**
 * pickMoonCraters — the craters the Moon pass rings this frame: facing the eye (a
 * centre just past the horizon still shows its near rim), on screen within 0.7 of its
 * own diameter, and at least the rim size cut across, largest apparent diameter first,
 * at most `ANTIQUE_MOON_MAX_CRATERS`. Indices into the table.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonCraterView } from '../@types/MoonCraterView';
import {
  ANTIQUE_MOON_MAX_CRATERS,
  ANTIQUE_MOON_RIM_REACH,
  ANTIQUE_MOON_RIM_UNITS,
} from '../data/antiqueMoonPrint';

export function pickMoonCraters(table: MoonCraterTable, view: MoonCraterView): number[] {
  const { centres, rho } = table;
  const [ex, ey, ez] = view.eye;
  const m = view.mvp;
  const minPx = ANTIQUE_MOON_RIM_UNITS[0] * view.unitPx;
  const picked: number[] = [];
  const sizePx: number[] = [];
  for (let i = 0; i < table.count; i++) {
    const cx = centres[3 * i]!;
    const cy = centres[3 * i + 1]!;
    const cz = centres[3 * i + 2]!;
    const vx = cx - ex;
    const vy = cy - ey;
    const vz = cz - ez;
    const dist = Math.hypot(vx, vy, vz);
    const dPx = (2 * rho[i]! * view.pxPerRad) / dist;
    if (dPx < minPx) continue;
    // sine of the eye's elevation over the crater's horizon, against its reach
    if (-(cx * vx + cy * vy + cz * vz) / dist <= -Math.sin(ANTIQUE_MOON_RIM_REACH * rho[i]!))
      continue;
    const w = m[3]! * cx + m[7]! * cy + m[11]! * cz + m[15]!;
    if (w <= 0) continue;
    const x = (0.5 + (0.5 * (m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!)) / w) * view.widthPx;
    const y = (0.5 - (0.5 * (m[1]! * cx + m[5]! * cy + m[9]! * cz + m[13]!)) / w) * view.heightPx;
    const margin = 0.7 * dPx;
    if (x < -margin || x > view.widthPx + margin || y < -margin || y > view.heightPx + margin)
      continue;
    picked.push(i);
    sizePx.push(dPx);
  }
  const order = picked.map((_, k) => k).sort((a, b) => sizePx[b]! - sizePx[a]!);
  return order.slice(0, ANTIQUE_MOON_MAX_CRATERS).map((k) => picked[k]!);
}
