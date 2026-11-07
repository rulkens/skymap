/**
 * pickMoonCraters — the craters the Moon pass rings this frame: facing the eye (a
 * centre just past the horizon still shows its near rim), on screen within 0.7 of its
 * own diameter, and at least the rim size cut across (a named crater its smaller own).
 * Every named crater whose name shows comes first, then the largest by apparent diameter, to one ring per
 * `ANTIQUE_MOON_RING_AREA_UNITS` of visible disc, at most `ANTIQUE_MOON_MAX_CRATERS`.
 * Indices into the table.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonCraterView } from '../@types/MoonCraterView';
import type { MoonNamedCrater } from '../@types/MoonNamedCrater';
import {
  ANTIQUE_MOON_MAX_CRATERS,
  ANTIQUE_MOON_NAMED_RIM_UNITS,
  ANTIQUE_MOON_RIM_REACH,
  ANTIQUE_MOON_RIM_UNITS,
  ANTIQUE_MOON_RING_AREA_UNITS,
} from '../data/antiqueMoonPrint';
import { visibleDiscAreaPx } from './visibleDiscAreaPx';

export function pickMoonCraters(
  table: MoonCraterTable,
  view: MoonCraterView,
  named: readonly MoonNamedCrater[] = [],
): number[] {
  const { centres, rho } = table;
  const [ex, ey, ez] = view.eye;
  const m = view.mvp;
  const sizeOf = (i: number, minPx: number): number => {
    const cx = centres[3 * i]!;
    const cy = centres[3 * i + 1]!;
    const cz = centres[3 * i + 2]!;
    const vx = cx - ex;
    const vy = cy - ey;
    const vz = cz - ez;
    const dist = Math.hypot(vx, vy, vz);
    const dPx = (2 * rho[i]! * view.pxPerRad) / dist;
    if (dPx < minPx) return 0;
    // sine of the eye's elevation over the crater's horizon, against its reach
    if (-(cx * vx + cy * vy + cz * vz) / dist <= -Math.sin(ANTIQUE_MOON_RIM_REACH * rho[i]!))
      return 0;
    const w = m[3]! * cx + m[7]! * cy + m[11]! * cz + m[15]!;
    if (w <= 0) return 0;
    const x = (0.5 + (0.5 * (m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!)) / w) * view.widthPx;
    const y = (0.5 - (0.5 * (m[1]! * cx + m[5]! * cy + m[9]! * cz + m[13]!)) / w) * view.heightPx;
    const margin = 0.7 * dPx;
    if (x < -margin || x > view.widthPx + margin || y < -margin || y > view.heightPx + margin)
      return 0;
    return dPx;
  };

  const budget = Math.min(
    ANTIQUE_MOON_MAX_CRATERS,
    Math.round(visibleDiscAreaPx(view) / view.unitPx ** 2 / ANTIQUE_MOON_RING_AREA_UNITS),
  );
  const chosen = new Set<number>();
  for (const { index, revealPx } of named) {
    if (chosen.size >= budget) break;
    if (sizeOf(index, ANTIQUE_MOON_NAMED_RIM_UNITS * view.unitPx) >= revealPx) chosen.add(index);
  }
  const rest: number[] = [];
  const sizePx: number[] = [];
  for (let i = 0; i < table.count; i++) {
    if (chosen.has(i)) continue;
    const dPx = sizeOf(i, ANTIQUE_MOON_RIM_UNITS[0] * view.unitPx);
    if (dPx <= 0) continue;
    rest.push(i);
    sizePx.push(dPx);
  }
  const order = rest.map((_, k) => k).sort((a, b) => sizePx[b]! - sizePx[a]!);
  return [...chosen, ...order.slice(0, budget - chosen.size).map((k) => rest[k]!)];
}
