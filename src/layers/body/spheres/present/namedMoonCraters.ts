/**
 * namedMoonCraters — the crater table's row for each crater the look names, so the
 * Moon pass rings every crater whose name shows: the row whose centre lies nearest
 * the name's, among rows within half the named radius and of a like size (the table's
 * radii are LOLA's crest, a few per cent off the gazetteer's).
 */

import type { AntiqueMoonPlace } from '../../../../@types/rendering/AntiqueMoonPlace';
import type { MoonCraterTable } from '../@types/MoonCraterTable';
import type { MoonNamedCrater } from '../@types/MoonNamedCrater';
import { ANTIQUE_MOON_PLACE_REVEAL } from '../../../../data/labels/antiqueMoonPlaceReveal';

const DEG = Math.PI / 180;

export function namedMoonCraters(
  table: MoonCraterTable,
  places: readonly AntiqueMoonPlace[],
  moonRadiusKm: number,
): MoonNamedCrater[] {
  const [base, grow] = ANTIQUE_MOON_PLACE_REVEAL.craterPx;
  const named: MoonNamedCrater[] = [];
  for (const place of places) {
    if (place.kind !== 'crater') continue;
    const rho = place.diameterKm / 2 / moonRadiusKm;
    const lat = place.latDeg * DEG;
    const lon = place.lonDeg * DEG;
    const p = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    let best = -1;
    let bestCos = Math.cos(0.5 * rho);
    for (let i = 0; i < table.count; i++) {
      const r = table.rho[i]! / rho;
      if (r < 0.6 || r > 1.6) continue;
      const c = table.centres;
      const cos = p[0]! * c[3 * i]! + p[1]! * c[3 * i + 1]! + p[2]! * c[3 * i + 2]!;
      if (cos > bestCos) {
        bestCos = cos;
        best = i;
      }
    }
    if (best >= 0) named.push({ id: place.id, index: best, revealPx: base * grow ** place.rank });
  }
  return named;
}
