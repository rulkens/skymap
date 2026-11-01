import type { OctreeChunk } from './OctreeChunk';
import type { Octree } from './Octree';
import type { OctreeStreamFormat } from './OctreeStreamFormat';

/** What `createOctreeChunkStream` closes over: the index, its format, pool size and the renderer's two writes. */
export type OctreeChunkStreamDeps<C extends { readonly count: number }> = {
  readonly octree: Octree<C>;
  readonly format: OctreeStreamFormat<C>;
  readonly slots: number;
  readonly requestRender: () => void;
  /** `renderer.uploadChunk`; `hostSlot` is the parent's slot, null for the index. */
  readonly upload: (slot: number, chunk: OctreeChunk<C>, hostSlot: number | null) => void;
  /** `renderer.evictChunk` for this source; the parent is still resident when its child goes. */
  readonly evict: (slot: number, hostSlot: number | null) => void;
  /** Resolves null on any failure; defaults to `fetch(dataUrl(path))`. */
  readonly fetchChunk?: (path: string) => Promise<ArrayBuffer | null>;
};
