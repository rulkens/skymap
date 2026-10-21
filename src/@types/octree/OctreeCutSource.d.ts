/** A source's GPU cut: the pool's node table plus its live and capture cuts. */

import type { Octree } from './Octree';
import type { OctreeCutState } from './OctreeCutState';
import type { OctreePoolShape } from './OctreePoolShape';

export type OctreeCutSource = {
  readonly octree: Octree<{ readonly count: number }>;
  /** Chunk slots and records past the index; zero when the index has no chunks. */
  readonly pool: OctreePoolShape;
  /** `indexNodes + pool.slots·chunkNodeCap` rows. */
  readonly nodes: GPUBuffer;
  /** One u32 per slot: the resident chunk's row count, 0 when empty (`cut.wesl` skips the rest). */
  readonly slotRows: GPUBuffer;
  readonly live: OctreeCutState;
  /** Built on the first capture: most sessions never bake a sky cubemap. */
  capture: OctreeCutState | null;
};
