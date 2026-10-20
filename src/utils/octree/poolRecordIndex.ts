import type { OctreeChunkRef } from '../../@types/octree/OctreeChunkRef';
import type { OctreePoolLayout } from '../../@types/octree/OctreePoolLayout';

/** The inverse of `recordOrdinal`: null when no slot holds the ordinal's chunk. */
export function poolRecordIndex(
  layout: OctreePoolLayout,
  slotRefs: readonly (OctreeChunkRef | null)[],
  ordinal: number,
): number | null {
  const { indexRecords, chunkCapacity } = layout;
  if (ordinal < indexRecords) return ordinal;
  const slot = slotRefs.findIndex(
    (ref) => ref !== null && ordinal >= ref.recordBase && ordinal < ref.recordBase + ref.records,
  );
  if (slot < 0) return null;
  return indexRecords + slot * chunkCapacity + (ordinal - slotRefs[slot]!.recordBase);
}
