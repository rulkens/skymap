import type { OctreeChunkStream } from './OctreeChunkStream';
import type { Octree } from './Octree';
import type { OctreeChunk } from './OctreeChunk';
import type { SourceType } from '../data/SourceType';

/** What installing a source's chunk pool touches; read by the slots at load and by `resizeStarPools` at runtime. */
export type OctreePoolHost<C extends { readonly count: number }> = {
  readonly renderer: {
    upload(source: SourceType, octree: Octree<C>, slots: number): number;
    uploadChunk(
      source: SourceType,
      slot: number,
      chunk: OctreeChunk<C>,
      hostSlot: number | null,
    ): void;
    evictChunk(source: SourceType, slot: number, hostSlot: number | null): void;
  };
  readonly chunkStreams: Map<SourceType, OctreeChunkStream<C>>;
  readonly requestRender: () => void;
};
