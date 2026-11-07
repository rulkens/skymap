/**
 * antiqueMapDetail — the antique Earth map's reveal level for an eye
 * `altitudeKm` over the ground, with `unitsPerRad` print units per radian at
 * the view centre: log2 of print units per km of ground under the eye over
 * ANTIQUE_MAP_DETAIL_BASE. The GPU signs and lines and the CPU names share it,
 * so a name and its sign arrive together.
 */

import { ANTIQUE_MAP_DETAIL_BASE } from '../data/antiqueMapReveal';

export function antiqueMapDetail(unitsPerRad: number, altitudeKm: number): number {
  return Math.log2(unitsPerRad / Math.max(altitudeKm, 0.001) / ANTIQUE_MAP_DETAIL_BASE);
}
