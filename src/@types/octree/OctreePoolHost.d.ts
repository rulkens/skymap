import type { OctreeChunkStream } from './OctreeChunkStream';
import type { Octree } from './Octree';
import type { OctreeChunk } from './OctreeChunk';
import type { SourceType } from '../data/SourceType';
import type { OctreePoolShape } from './OctreePoolShape';

/** What installing a source's chunk pool touches; read by the slots at load and by `resizeStarPools` at runtime. */
export type OctreePoolHost<C extends { readonly count: number }> = {
  readonly renderer: {
    upload(source: SourceType, octree: Octree<C>, slots: number): OctreePoolShape;
    uploadChunk(
      source: SourceType,
      slot: number,
      chunk: OctreeChunk<C>,
      hostSlot: number | null,
      runStart: number,
    ): void;
    evictChunk(source: SourceType, slot: number, hostSlot: number | null): void;
  };
  readonly chunkStreams: Map<SourceType, OctreeChunkStream<C>>;
  readonly requestRender: () => void;
};
