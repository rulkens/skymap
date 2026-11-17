import type { OctreeChunkStream } from './OctreeChunkStream';
import type { Octree } from './Octree';
import type { OctreeChunk } from './OctreeChunk';
import type { SourceId } from '../data/SourceId';

/** What installing a source's chunk pool touches; read by the slots at load and by `resizeStarPools` at runtime. */
export type OctreePoolHost<C extends { readonly count: number }> = {
  readonly renderer: {
    upload(source: SourceId, octree: Octree<C>, slots: number): number;
    uploadChunk(
      source: SourceId,
      slot: number,
      chunk: OctreeChunk<C>,
      hostSlot: number | null,
    ): void;
    evictChunk(source: SourceId, slot: number, hostSlot: number | null): void;
    release(source: SourceId): void;
  };
  readonly chunkStreams: Map<SourceId, OctreeChunkStream<C>>;
  readonly requestRender: () => void;
};
