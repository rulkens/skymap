import type { FetchDataBytes } from '../loading/FetchDataBytes';
import type { OctreeChunk } from './OctreeChunk';
import type { Octree } from './Octree';
import type { OctreeStreamFormat } from './OctreeStreamFormat';
import type { OctreePoolShape } from './OctreePoolShape';
import type { OctreeChunkRuns } from './OctreeChunkRuns';

/** What `createOctreeChunkStream` closes over: the index, its format, pool shape and the renderer's two writes. */
export type OctreeChunkStreamDeps<C extends { readonly count: number }> = {
  readonly octree: Octree<C>;
  readonly format: OctreeStreamFormat<C>;
  readonly pool: OctreePoolShape;
  readonly requestRender: () => void;
  /**
   * `renderer.uploadChunk`; `hostSlot` is the parent's slot, null for the index; `runs` where the
   * chunk's records and rows start past the index's.
   */
  readonly upload: (
    slot: number,
    chunk: OctreeChunk<C>,
    hostSlot: number | null,
    runs: OctreeChunkRuns,
  ) => void;
  /** `renderer.evictChunk` for this source; the parent is still resident when its child goes. */
  readonly evict: (slot: number, hostSlot: number | null) => void;
  /** Resolves null on any failure; defaults to `fetch(dataUrl(path))`. */
  readonly fetchChunk?: FetchDataBytes;
};
