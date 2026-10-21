import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeSlotRun } from '../../../@types/octree/OctreeSlotRun';

/** One octree source's pool as `galaxyPooledPointRenderer` holds it. */
export type LoadedPooledSource = {
  octree: Octree<GalaxyColumns>;
  /** The chunk and record run each slot holds: the pool index ↔ ordinal map, and a host slot's rows. */
  slotRuns: (OctreeSlotRun<GalaxyColumns> | null)[];
  /** `slotRuns` at the last pick draw: a readback names what was drawn, not what landed since. */
  pickSlotRuns: (OctreeSlotRun<GalaxyColumns> | null)[];
  buffers: GPUBuffer[];
  recordsBuffer: GPUBuffer;
  /** PooledRecordUniforms: the decode constants, then the blob words each draw rewrites. */
  pooledBuffer: GPUBuffer;
  fadeBuffers: GPUBuffer[];
  /** One `@group(2)` per view slot, each over that slot's fade buffer. */
  bindGroups: GPUBindGroup[];
};
