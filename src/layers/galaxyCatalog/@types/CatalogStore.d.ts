import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { SourceType } from '../../../@types/data/SourceType';
import type { CatalogDrawEntry } from './CatalogDrawEntry';

/** The per-catalog GPU-resource store — see `catalogStore.ts`'s module header. */
export type CatalogStore = {
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void>;
  unload(id: GalaxyCatalogId): void;
  setBiasUploadCallback(cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null): void;
  setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void;
  spliceSchechterRatios(source: SourceType, ratios: Float32Array): void;
  spliceAngularWeights(source: SourceType, weights: Float32Array): void;
  clearBiasOverlays(source?: SourceType): void;
  totalCount(): number;
  hasCatalog(id: GalaxyCatalogId): boolean;
  /** Narrow public projection consumed by the pick program. */
  loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }>;
  /** Full per-source draw essentials, in draw order, for `galaxyPointRenderer.draw()`. */
  entries(): IterableIterator<CatalogDrawEntry>;
  destroy(): void;
};
