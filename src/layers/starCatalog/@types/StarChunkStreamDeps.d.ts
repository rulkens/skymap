import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';

/** What `createStarChunkStream` closes over: the index, pool size and the renderer's two writes. */
export type StarChunkStreamDeps = {
  readonly octree: StarOctree;
  readonly binBaseName: string;
  readonly slots: number;
  readonly requestRender: () => void;
  /** `renderer.uploadChunk`; `hostSlot` is the parent's slot, null for the index. */
  readonly upload: (slot: number, chunk: StarChunk, hostSlot: number | null) => void;
  /** `renderer.evictChunk` for this source; the parent is still resident when its child goes. */
  readonly evict: (slot: number, hostSlot: number | null) => void;
  /** Resolves null on any failure; defaults to `fetch(dataUrl(path))`. */
  readonly fetchChunk?: (path: string) => Promise<ArrayBuffer | null>;
};
