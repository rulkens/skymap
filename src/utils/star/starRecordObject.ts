import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';
import type { StarRecordObject } from '../../@types/data/starCatalog/StarRecordObject';

/**
 * The object a catalog-global record ordinal names: index records first, then
 * each chunk's in `chunks` order. Inverse of `starRecordOrdinal`. An empty
 * chunk shares its base with the next, so the search takes the last chunk at
 * or below the ordinal; null past the catalog's last record.
 */
export function starRecordObject(octree: StarOctree, ordinal: number): StarRecordObject | null {
  const base = octree.recordOrdinalBase;
  const end = base[base.length - 1]!;
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= end) return null;
  if (ordinal < base[0]!) return { chunk: null, local: ordinal };
  let lo = 0;
  let hi = base.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (base[mid]! <= ordinal) lo = mid;
    else hi = mid - 1;
  }
  return { chunk: lo, local: ordinal - base[lo]! };
}
