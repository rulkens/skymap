import type { OctreeChunkRef } from '../../@types/octree/OctreeChunkRef';
import type { OctreePoolLayout } from '../../@types/octree/OctreePoolLayout';

/** A pool-absolute record index as the catalog ordinal; null for an empty slot or a row past the chunk. */
export function recordOrdinal(
  layout: OctreePoolLayout,
  slotRefs: readonly (OctreeChunkRef | null)[],
  poolIndex: number,
): number | null {
  const { indexRecords, chunkCapacity, slots } = layout;
  if (poolIndex < indexRecords) return poolIndex;
  const slot = Math.floor((poolIndex - indexRecords) / chunkCapacity);
  const ref = slot < slots ? slotRefs[slot]! : null;
  if (ref === null) return null;
  const local = poolIndex - indexRecords - slot * chunkCapacity;
  return local < ref.records ? ref.recordBase + local : null;
}
