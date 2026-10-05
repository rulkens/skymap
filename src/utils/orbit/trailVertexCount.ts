/**
 * trailVertexCount — how many ascending `tDays` entries are at or before
 * `simDays` (binary search). The trail is the first `k` vertices plus a head
 * at the craft's own position, so scrubbing backwards shrinks `k` with no rebuild.
 */

export function trailVertexCount(tDays: Float64Array, simDays: number): number {
  let lo = 0;
  let hi = tDays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tDays[mid]! <= simDays) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
