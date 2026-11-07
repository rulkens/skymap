/**
 * pickMoonCraters — the craters the Moon pass rings this frame: facing the eye (a
 * centre just past the horizon still shows its near rim), on screen within 0.7 of its
 * own diameter, and at least the rim size cut across (a named crater its smaller own).
 * Every named crater whose name shows comes first, then the largest as seen (foreshortened;
 * one wider than the frame ranked down) whose centre is outside every larger kept ring (but
 * for a small one on a named crater's floor), to one ring per
 * `ANTIQUE_MOON_RING_AREA_UNITS` of visible disc, at most `ANTIQUE_MOON_MAX_CRATERS`.
 * Indices into the table.
 */

import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonCraterView } from '../@types/MoonCraterView';
import type { MoonNamedCrater } from '../@types/MoonNamedCrater';
import {
  ANTIQUE_MOON_FLOOR_CRATER,
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
  // Apparent diameter (px), or 0 when not ringed; `seen` instead the ring's mean axis, its
  // foreshortening counted, so a near crater outranks a bigger one edge-on at the horizon.
  const sizeOf = (i: number, minPx: number, seen = false): number => {
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
    const sinEl = -(cx * vx + cy * vy + cz * vz) / dist;
    if (sinEl <= -Math.sin(ANTIQUE_MOON_RIM_REACH * rho[i]!)) return 0;
    const w = m[3]! * cx + m[7]! * cy + m[11]! * cz + m[15]!;
    if (w <= 0) return 0;
    const x = (0.5 + (0.5 * (m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!)) / w) * view.widthPx;
    const y = (0.5 - (0.5 * (m[1]! * cx + m[5]! * cy + m[9]! * cz + m[13]!)) / w) * view.heightPx;
    const margin = 0.7 * dPx;
    if (x < -margin || x > view.widthPx + margin || y < -margin || y > view.heightPx + margin)
      return 0;
    return seen ? dPx * Math.sqrt(Math.max(sinEl, 0.02)) : dPx;
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
    const dPx = sizeOf(i, ANTIQUE_MOON_RIM_UNITS[0] * view.unitPx, true);
    if (dPx <= 0) continue;
    rest.push(i);
    // One wider than the frame shows only an arc of its rim: it ranks as if that much smaller.
    sizePx.push(dPx <= view.heightPx ? dPx : view.heightPx ** 2 / dPx);
  }
  const order = rest.map((_, k) => k).sort((a, b) => sizePx[b]! - sizePx[a]!);
  // A ring whose centre lies inside a larger kept ring is more than half inside it:
  // nested and overlapping circles read as bubble wrap, not as craters. A small one
  // wholly on a named crater's floor is its floor's own (Clavius' chain): it stays, and
  // comes before the rest.
  const apart = (i: number, j: number): number =>
    Math.acos(
      Math.min(
        1,
        centres[3 * i]! * centres[3 * j]! +
          centres[3 * i + 1]! * centres[3 * j + 1]! +
          centres[3 * i + 2]! * centres[3 * j + 2]!,
      ),
    );
  const onFloorOf = (i: number, j: number): boolean =>
    chosen.has(j) &&
    rho[i]! <= ANTIQUE_MOON_FLOOR_CRATER[0] * rho[j]! &&
    apart(i, j) + rho[i]! <= ANTIQUE_MOON_FLOOR_CRATER[1] * rho[j]!;
  const kept = [...chosen];
  const inside = (i: number): boolean =>
    kept.some((j) => rho[j]! > rho[i]! && apart(i, j) < rho[j]! && !onFloorOf(i, j));
  for (const floor of [true, false]) {
    for (const k of order) {
      const i = rest[k]!;
      if (kept.length >= budget) break;
      if ([...chosen].some((j) => onFloorOf(i, j)) === floor && !inside(i)) kept.push(i);
    }
  }
  return kept;
}
