/**
 * percentileOf — find the rank of `value` in a pre-sorted ascending
 * Float64Array and return it as a 0–100 percentile.
 *
 * Binary searches for the largest index whose value is ≤ the query.
 * No linear interpolation between adjacent breakpoints — both callers
 * (auditCf4Anchors, verifyCf4Scfd) only need monotonic ranking, so the
 * cheaper integer-rank version is fine.
 *
 * Why a Float64Array argument rather than a generic number[]?  The
 * callers already hold typed-array data (decoded SCFD voxels) and a
 * conversion would dominate the cost of the search.
 */
export function percentileOf(value: number, sortedAsc: Float64Array): number {
  let lo = 0;
  let hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (sortedAsc[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return (lo / (sortedAsc.length - 1)) * 100;
}
