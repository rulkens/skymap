import type { WeightStats } from '../../../@types/catalog/weights/WeightStats';
import { quantileOf } from '../../utils/math/quantileOf';

/** Smallest, median and largest of a loaded catalog's stored weights. */
export function weightStatsFor(weight: Float32Array): WeightStats {
  let min = Infinity;
  let max = -Infinity;
  for (const w of weight) {
    if (w < min) min = w;
    if (w > max) max = w;
  }
  return { min, median: quantileOf(Float64Array.from(weight), 0.5), max };
}
