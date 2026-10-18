import type { StarCatalogRenderer } from '../../layers/starCatalog/@types/StarCatalogRenderer';
import type { OctreeChunkStream } from './OctreeChunkStream';
import type { SourceType } from '../data/SourceType';

/** What installing a source's chunk pool touches; read by the slots at load and by `resizeStarPools` at runtime. */
export type OctreePoolHost<C extends { readonly count: number }> = {
  readonly renderer: StarCatalogRenderer;
  readonly chunkStreams: Map<SourceType, OctreeChunkStream<C>>;
  readonly requestRender: () => void;
};
