import type { OctreeSlotRun } from '../../@types/octree/OctreeSlotRun';

/** A pool-absolute record index as the catalog ordinal; null in a run nothing holds or past its chunk. */
export function recordOrdinal(
  indexRecords: number,
  slots: readonly (OctreeSlotRun<{ readonly count: number }> | null)[],
  poolIndex: number,
): number | null {
  if (poolIndex < indexRecords) return poolIndex;
  for (const run of slots) {
    if (run === null) continue;
    const local = poolIndex - run.poolBase;
    if (local >= 0 && local < run.chunk.ref.records) return run.chunk.ref.recordBase + local;
  }
  return null;
}
