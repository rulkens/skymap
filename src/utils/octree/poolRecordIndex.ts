import type { OctreeSlotRun } from '../../@types/octree/OctreeSlotRun';

/** The inverse of `recordOrdinal`: null when no slot holds the ordinal's chunk. */
export function poolRecordIndex(
  indexRecords: number,
  slots: readonly (OctreeSlotRun<{ readonly count: number }> | null)[],
  ordinal: number,
): number | null {
  if (ordinal < indexRecords) return ordinal;
  for (const run of slots) {
    if (run === null) continue;
    const local = ordinal - run.chunk.ref.recordBase;
    if (local >= 0 && local < run.chunk.ref.records) return run.poolBase + local;
  }
  return null;
}
