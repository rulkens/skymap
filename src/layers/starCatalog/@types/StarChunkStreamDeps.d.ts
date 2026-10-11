import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';

/** What `createStarChunkStream` closes over: the index, the pool size and the renderer's two writes. */
export type StarChunkStreamDeps = {
  readonly octree: StarOctree;
  readonly binBaseName: string;
  readonly slots: number;
  readonly requestRender: () => void;
  /** `renderer.uploadChunk` for this source. */
  readonly upload: (slot: number, chunk: StarChunk) => void;
  /** `renderer.evictChunk` for this source. */
  readonly evict: (slot: number) => void;
  /** Resolves null on any failure; defaults to `fetch(dataUrl(path))`. */
  readonly fetchChunk?: (path: string) => Promise<ArrayBuffer | null>;
};
