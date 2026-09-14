/**
 * sortSplatOrder — the back-to-front draw order alpha-blended splats need,
 * keyed on camera-relative depth `dot(p − eye, forward)` (metres). A
 * comparator sort over 1–2 M indices costs seconds, so this counting-sorts
 * depth quantised to 16 bits — three linear passes, no comparisons.
 * Splats behind the eye carry negative depths and land in the low buckets
 * like any other; the [min, max] rescale needs no sign special-case.
 * A clip box cuts before all of that: only the splats inside it are sorted,
 * so the returned length is also the instance count the renderer draws.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { BoundsM } from '../../@types/BoundsM';

const BUCKETS = 1 << 16;

export function sortSplatOrder(
  positionsM: Float32Array,
  eyeM: Vec3,
  forwardM: Vec3,
  clipBoxM: BoundsM | null = null,
): Uint32Array {
  const count = Math.floor(positionsM.length / 3);
  // The splats entering the sort. `null` is the unclipped path — no filter
  // pass and no second index array exist unless a box is actually set.
  const members = clipBoxM === null ? null : membersInside(positionsM, count, clipBoxM);
  const drawn = members === null ? count : members.length;
  const order = new Uint32Array(drawn);
  if (drawn === 0) return order;

  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < drawn; k++) {
    const depth = depthOf(positionsM, members === null ? k : members[k]!, eyeM, forwardM);
    if (depth < min) min = depth;
    if (depth > max) max = depth;
  }

  // Zero extent (one splat, or a camera dead-on a plane) would divide by zero;
  // one bucket holds everything and the input order is already an answer.
  const scale = max > min ? (BUCKETS - 1) / (max - min) : 0;
  const counts = new Uint32Array(BUCKETS);
  // The keys, not the depths: 2 bytes a splat instead of 8, and the scatter
  // below re-reads them rather than re-quantising.
  const keys = new Uint16Array(drawn);
  for (let k = 0; k < drawn; k++) {
    const index = members === null ? k : members[k]!;
    // Clamped: `(max − min) * (65535 / (max − min))` can round above 65535.
    const key = Math.min(
      BUCKETS - 1,
      ((depthOf(positionsM, index, eyeM, forwardM) - min) * scale) | 0,
    );
    keys[k] = key;
    counts[key]! += 1;
  }

  // Prefix-summed from the TOP bucket down, so the farthest splats claim the
  // first slots — back-to-front, the order alpha blending composites in.
  let cursor = 0;
  for (let bucket = BUCKETS - 1; bucket >= 0; bucket--) {
    const inBucket = counts[bucket]!;
    counts[bucket] = cursor;
    cursor += inBucket;
  }

  for (let k = 0; k < drawn; k++) {
    const bucket = keys[k]!;
    order[counts[bucket]!] = members === null ? k : members[k]!;
    counts[bucket]! += 1;
  }
  return order;
}

/** The indices inside the box, ascending — a view onto an over-allocated
 *  buffer, so the filter stays one pass rather than a count then a fill. */
function membersInside(positionsM: Float32Array, count: number, box: BoundsM): Uint32Array {
  const { min, max } = box;
  const members = new Uint32Array(count);
  let inside = 0;
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const x = positionsM[base]!;
    const y = positionsM[base + 1]!;
    const z = positionsM[base + 2]!;
    if (x < min[0] || x > max[0] || y < min[1] || y > max[1] || z < min[2] || z > max[2]) continue;
    members[inside++] = i;
  }
  return members.subarray(0, inside);
}

/** Both passes above quantise through this one expression: a `min` rounded any
 *  differently would make `depth − min` negative, and the key −1. */
function depthOf(positionsM: Float32Array, i: number, eyeM: Vec3, forwardM: Vec3): number {
  const base = i * 3;
  return (
    (positionsM[base]! - eyeM[0]) * forwardM[0] +
    (positionsM[base + 1]! - eyeM[1]) * forwardM[1] +
    (positionsM[base + 2]! - eyeM[2]) * forwardM[2]
  );
}
