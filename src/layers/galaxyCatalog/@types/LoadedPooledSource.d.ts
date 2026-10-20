import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyPointStats } from '../../../@types/engine/GalaxyPointStats';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeChunk } from '../../../@types/octree/OctreeChunk';

/** One octree source's pool as `galaxyPooledPointRenderer` holds it. */
export type LoadedPooledSource = {
  octree: Octree<GalaxyColumns>;
  slots: number;
  stats: GalaxyPointStats;
  /** The chunk each slot holds: the pool index ↔ ordinal map, and a host slot's rows. */
  slotChunks: (OctreeChunk<GalaxyColumns> | null)[];
  /** `slotChunks` at the last pick draw: a readback names what was drawn, not what landed since. */
  pickSlotChunks: (OctreeChunk<GalaxyColumns> | null)[];
  buffers: GPUBuffer[];
  recordsBuffer: GPUBuffer;
  fadeBuffers: GPUBuffer[];
  /** One `@group(2)` per view slot, each over that slot's fade buffer. */
  bindGroups: GPUBindGroup[];
};
