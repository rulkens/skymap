import { median } from '../../../utils/perf/median';
import type { WeightStats } from '../../@types/WeightStats';

/** Smallest, median and largest of a loaded catalog's stored weights. */
export function weightStatsFor(weight: Float32Array): WeightStats {
  let min = Infinity;
  let max = -Infinity;
  for (const w of weight) {
    if (w < min) min = w;
    if (w > max) max = w;
  }
  return { min, median: median(Array.from(weight)), max };
}
