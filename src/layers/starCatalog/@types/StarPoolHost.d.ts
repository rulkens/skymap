import type { StarCatalogRenderer } from './StarCatalogRenderer';
import type { StarChunkStream } from './StarChunkStream';
import type { SourceType } from '../../../@types/data/SourceType';

/** What installing a source's chunk pool touches; read by the slots at load and by `resizeStarPools` at runtime. */
export type StarPoolHost = {
  readonly renderer: StarCatalogRenderer;
  readonly chunkStreams: Map<SourceType, StarChunkStream>;
  readonly requestRender: () => void;
};
