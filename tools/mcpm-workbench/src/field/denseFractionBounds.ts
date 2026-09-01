import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { keptCountFor } from './keptCountFor';

/**
 * denseFractionBounds — bounds of the densest `fraction` of `count` catalog
 * points, evicting the farthest-from-median fringe. Rank is normalized L∞
 * distance from a robust center: per-axis median for center, per-axis
 * interquartile range for scale (an axis with zero IQR — e.g. every point
 * coplanar — falls back to scale 1 rather than dividing by zero). `null` on
 * an empty catalog, matching `catalogBounds`'s own "nothing to bound" case.
 *
 * Single pass over the points to fold min/max: the only O(n log n) step is
 * sorting the rank values themselves, to find the `keptCount`-th smallest as
 * the eviction threshold — no prefix arrays, no sorted index array. Points
 * EXACTLY tied at the threshold rank are all kept (the predecessor prefix-cut
 * dropped ties past `keptCount`); duplicates can't widen bounds, so this only
 * matters on measure-zero cross-axis float ties.
 */
export function denseFractionBounds(
  positions: Float32Array,
  count: number,
  fraction: number,
): { min: Vec3; max: Vec3 } | null {
  if (count === 0) return null;

  const axisValues = (axis: number): Float64Array => {
    const values = new Float64Array(count);
    for (let i = 0; i < count; i++) values[i] = positions[i * 3 + axis]!;
    return values;
  };

  const center: Vec3 = [0, 0, 0];
  const scale: Vec3 = [1, 1, 1];
  for (let axis = 0; axis < 3; axis++) {
    const sorted = axisValues(axis).sort((a, b) => a - b);
    center[axis] = quantileSorted(sorted, 0.5);
    const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
    scale[axis] = iqr === 0 ? 1 : iqr;
  }

  const ranks = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const dx = Math.abs(positions[i * 3]! - center[0]) / scale[0];
    const dy = Math.abs(positions[i * 3 + 1]! - center[1]) / scale[1];
    const dz = Math.abs(positions[i * 3 + 2]! - center[2]) / scale[2];
    ranks[i] = Math.max(dx, dy, dz);
  }

  const keptCount = keptCountFor(count, fraction);
  const thresholdRank = Float64Array.from(ranks).sort((a, b) => a - b)[keptCount - 1]!;

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    if (ranks[i]! > thresholdRank) continue;
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

// Type-7 (R/NumPy default) linear-interpolation quantile over an already-sorted array.
function quantileSorted(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const r = q * (n - 1);
  const lo = Math.floor(r);
  const frac = r - lo;
  if (frac === 0) return sorted[lo]!;
  return sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!);
}
