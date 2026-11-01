/**
 * catalogIndexOf — a NORAD number's index in the day's catalog, or -1. The catalog is sorted by
 * NORAD number (`buildSatelliteCatalog`), so this is a binary search, with no index to keep.
 */
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';

export function catalogIndexOf(cat: SatelliteCatalog, noradId: number): number {
  let lo = 0;
  let hi = cat.noradId.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = cat.noradId[mid]!;
    if (at === noradId) return mid;
    if (at < noradId) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
