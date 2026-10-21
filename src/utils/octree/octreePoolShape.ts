import type { Octree } from '../../@types/octree/Octree';
import type { OctreePoolShape } from '../../@types/octree/OctreePoolShape';
import { OCTREE_MIN_RUN_RECORDS } from '../../data/octree/octreeMinRunRecords';

/**
 * A tier's `slots` knob as a pool: the records of `slots` largest chunks (a fixed-slot pool's
 * memory), and as many chunk slots as those records hold at the bake's mean chunk size. Real
 * runs round up, so they average more than that mean and the slots never bind before the records.
 */
export function octreePoolShape(
  octree: Pick<Octree<{ readonly count: number }>, 'chunkCount' | 'chunkCapacity' | 'recordCount'>,
  slots: number,
): OctreePoolShape {
  const { chunkCount, chunkCapacity, recordCount } = octree;
  const blocks = Math.min(slots, chunkCount);
  if (blocks === 0) return { slots: 0, records: 0, maxRun: 0 };
  const maxRun = 2 ** Math.ceil(Math.log2(chunkCapacity));
  const records = blocks * maxRun;
  const minRun = Math.min(OCTREE_MIN_RUN_RECORDS, maxRun);
  const meanSlots = recordCount === 0 ? Infinity : Math.ceil((records * chunkCount) / recordCount);
  return { slots: Math.min(chunkCount, records / minRun, meanSlots), records, maxRun };
}
