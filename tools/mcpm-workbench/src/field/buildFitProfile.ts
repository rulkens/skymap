import type { FitProfile } from '../../@types/FitProfile';

/**
 * buildFitProfile — precomputes the O(1) lookup `fitProfileBounds` reads from.
 *
 * Rank is normalized L∞ distance from a robust center: per-axis median for
 * center, per-axis interquartile range for scale (an axis with zero IQR —
 * e.g. every point coplanar — falls back to scale 1 rather than dividing by
 * zero). Sorting by rank once and taking running min/max along that order
 * turns "bounds of the densest fraction" into a prefix-array index.
 */
export function buildFitProfile(positions: Float32Array): FitProfile {
  const count = positions.length / 3;
  if (count === 0) {
    return {
      count: 0,
      sortedIndices: new Uint32Array(0),
      prefixMin: new Float32Array(0),
      prefixMax: new Float32Array(0),
    };
  }

  const axisValues = (axis: number): number[] => {
    const values = new Array<number>(count);
    for (let i = 0; i < count; i++) values[i] = positions[i * 3 + axis]!;
    return values;
  };
  const sortedAxes = [axisValues(0), axisValues(1), axisValues(2)].map((values) =>
    [...values].sort((a, b) => a - b),
  );

  const center: [number, number, number] = [0, 0, 0];
  const scale: [number, number, number] = [1, 1, 1];
  for (let axis = 0; axis < 3; axis++) {
    const sorted = sortedAxes[axis]!;
    center[axis] = quantileSorted(sorted, 0.5);
    const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
    scale[axis] = iqr === 0 ? 1 : iqr;
  }

  const rank = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const dx = Math.abs(positions[i * 3]! - center[0]) / scale[0];
    const dy = Math.abs(positions[i * 3 + 1]! - center[1]) / scale[1];
    const dz = Math.abs(positions[i * 3 + 2]! - center[2]) / scale[2];
    rank[i] = Math.max(dx, dy, dz);
  }

  const order = Array.from({ length: count }, (_, i) => i);
  order.sort((a, b) => rank[a]! - rank[b]!);
  const sortedIndices = Uint32Array.from(order);

  const prefixMin = new Float32Array(count * 3);
  const prefixMax = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const idx = sortedIndices[k]!;
    const x = positions[idx * 3]!;
    const y = positions[idx * 3 + 1]!;
    const z = positions[idx * 3 + 2]!;
    if (k === 0) {
      prefixMin[0] = x;
      prefixMin[1] = y;
      prefixMin[2] = z;
      prefixMax[0] = x;
      prefixMax[1] = y;
      prefixMax[2] = z;
    } else {
      const p = (k - 1) * 3;
      prefixMin[k * 3] = Math.min(prefixMin[p]!, x);
      prefixMin[k * 3 + 1] = Math.min(prefixMin[p + 1]!, y);
      prefixMin[k * 3 + 2] = Math.min(prefixMin[p + 2]!, z);
      prefixMax[k * 3] = Math.max(prefixMax[p]!, x);
      prefixMax[k * 3 + 1] = Math.max(prefixMax[p + 1]!, y);
      prefixMax[k * 3 + 2] = Math.max(prefixMax[p + 2]!, z);
    }
  }

  return { count, sortedIndices, prefixMin, prefixMax };
}

// Type-7 (R/NumPy default) linear-interpolation quantile over an already-sorted array.
function quantileSorted(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const r = q * (n - 1);
  const lo = Math.floor(r);
  const frac = r - lo;
  if (frac === 0) return sorted[lo]!;
  return sorted[lo]! + frac * (sorted[lo + 1]! - sorted[lo]!);
}
