import type { Octree } from '../../@types/octree/Octree';
import type { OctreePoolShape } from '../../@types/octree/OctreePoolShape';
import type { OctreeRunSpan } from '../../@types/octree/OctreeRunSpan';
import { OCTREE_MIN_NODE_RUN } from '../../data/octree/octreeMinNodeRun';
import { OCTREE_MIN_RUN_RECORDS } from '../../data/octree/octreeMinRunRecords';

const EMPTY: OctreeRunSpan = { total: 0, minRun: 1, maxRun: 1 };

/**
 * A tier's `slots` knob as a pool: the records of `slots` largest chunks, and node rows for those
 * records at `nodesPerRecord`, the source's measured row runs per record run, so the records bind
 * first. `slots` in the shape is the most chunks both spans hold at minimum runs.
 */
export function octreePoolShape(
  octree: Pick<Octree<{ readonly count: number }>, 'chunkCount' | 'chunkCapacity' | 'chunkNodeCap'>,
  slots: number,
  nodesPerRecord: number,
): OctreePoolShape {
  const blocks = Math.min(slots, octree.chunkCount);
  if (blocks === 0) return { slots: 0, records: EMPTY, nodes: EMPTY };
  const span = (total: number, maxRun: number, minRun: number): OctreeRunSpan => ({
    total: Math.ceil(total / maxRun) * maxRun,
    minRun: Math.min(minRun, maxRun),
    maxRun,
  });
  const maxRun = 2 ** Math.ceil(Math.log2(octree.chunkCapacity));
  const records = span(blocks * maxRun, maxRun, OCTREE_MIN_RUN_RECORDS);
  const maxNodeRun = 2 ** Math.ceil(Math.log2(octree.chunkNodeCap));
  const nodes = span(records.total * nodesPerRecord, maxNodeRun, OCTREE_MIN_NODE_RUN);
  return {
    slots: Math.min(octree.chunkCount, records.total / records.minRun, nodes.total / nodes.minRun),
    records,
    nodes,
  };
}
