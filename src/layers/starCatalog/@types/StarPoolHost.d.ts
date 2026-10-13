import type { StarCatalogRuntime } from './StarCatalogRuntime';

/** What installing a source's chunk pool touches; `StarCatalogRuntime` satisfies it. */
export type StarPoolHost = Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams' | 'requestRender'>;
