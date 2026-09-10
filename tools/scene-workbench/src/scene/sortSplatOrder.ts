/**
 * sortSplatOrder — the back-to-front draw order alpha-blended splats need,
 * keyed on camera-relative depth `dot(p − eye, forward)` (metres). A
 * comparator sort over 1–2 M indices costs seconds, so this counting-sorts
 * depth quantised to 16 bits — three linear passes, no comparisons.
 * Splats behind the eye carry negative depths and land in the low buckets
 * like any other; the [min, max] rescale needs no sign special-case.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const BUCKETS = 1 << 16;

export function sortSplatOrder(positionsM: Float32Array, eyeM: Vec3, forwardM: Vec3): Uint32Array {
  const count = Math.floor(positionsM.length / 3);
  const order = new Uint32Array(count);
  if (count === 0) return order;

  // f64, not f32: the bucket key is `depth − min`, and an f32 round-trip could
  // push a stored depth below the f64 `min` tracked here — a negative key.
  const depths = new Float64Array(count);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const depth =
      (positionsM[base]! - eyeM[0]) * forwardM[0] +
      (positionsM[base + 1]! - eyeM[1]) * forwardM[1] +
      (positionsM[base + 2]! - eyeM[2]) * forwardM[2];
    depths[i] = depth;
    if (depth < min) min = depth;
    if (depth > max) max = depth;
  }

  // Zero extent (one splat, or a camera-facing plane) would divide by zero;
  // one bucket holds everything and the input order is already an answer.
  const scale = max > min ? (BUCKETS - 1) / (max - min) : 0;
  const counts = new Uint32Array(BUCKETS);
  for (let i = 0; i < count; i++) {
    counts[bucketOf(depths[i]!, min, scale)]! += 1;
  }

  // Prefix-summed from the TOP bucket down, so the farthest splats claim the
  // first slots — back-to-front, the order alpha blending composites in.
  let cursor = 0;
  for (let bucket = BUCKETS - 1; bucket >= 0; bucket--) {
    const inBucket = counts[bucket]!;
    counts[bucket] = cursor;
    cursor += inBucket;
  }

  for (let i = 0; i < count; i++) {
    const bucket = bucketOf(depths[i]!, min, scale);
    order[counts[bucket]!] = i;
    counts[bucket]! += 1;
  }
  return order;
}

/** Clamped because `(max − min) * (65535 / (max − min))` can round above 65535. */
function bucketOf(depth: number, min: number, scale: number): number {
  return Math.min(BUCKETS - 1, ((depth - min) * scale) | 0);
}
