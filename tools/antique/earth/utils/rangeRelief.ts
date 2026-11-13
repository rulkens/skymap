/**
 * rangeRelief — per post, the relief (window max − min) over a box `radiusKm`
 * across: the measure that tells a range from hill country. The sea counts as
 * 0 m in the min, so a coast is not "relief" down to the sea floor.
 */

import type { HeightGrid } from '../@types/HeightGrid';
import { windowExtremum } from './windowExtremum';

/** No-data and sea read this low in the max windows, so they never win one. */
const VOID_M = -1e4;

export function rangeRelief(grid: HeightGrid, radiusKm: number): Float32Array {
  const high = windowExtremum(
    grid.h.map((v) => (Number.isNaN(v) ? VOID_M : v)),
    grid,
    radiusKm,
    'max',
  );
  const low = windowExtremum(
    grid.h.map((v) => (Number.isNaN(v) ? 0 : Math.max(0, v))),
    grid,
    radiusKm,
    'min',
  );
  return high.map((v, k) => v - low[k]!);
}
