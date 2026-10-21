/** A source's GPU cut: the pool's node table plus its live and capture cuts. */

import type { Octree } from './Octree';
import type { OctreeCutState } from './OctreeCutState';
import type { OctreePoolShape } from './OctreePoolShape';

export type OctreeCutSource = {
  readonly octree: Octree<{ readonly count: number }>;
  /** The pool past the index; empty when the index has no chunks. */
  readonly pool: OctreePoolShape;
  /** `indexNodes + pool.nodes.total` rows. */
  readonly nodes: GPUBuffer;
  /** One u32 per `pool.nodes.minRun` chunk rows: how many lead the page live (`cut.wesl` skips the rest). */
  readonly pageRows: GPUBuffer;
  readonly live: OctreeCutState;
  /** Built on the first capture: most sessions never bake a sky cubemap. */
  capture: OctreeCutState | null;
};
