import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';
import type { GalaxyPointStats } from './GalaxyPointStats';
import type { CatalogDrawEntry } from './CatalogDrawEntry';

/** The per-catalog GPU-resource store — see `catalogStore.ts`'s module header. */
export type CatalogStore = {
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog, stats: GalaxyPointStats): Promise<void>;
  unload(id: GalaxyCatalogId): void;
  totalCount(): number;
  /** Narrow public projection consumed by the pick program. */
  loadedSources(): IterableIterator<{
    source: GalaxyCatalogSourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }>;
  /** Full per-source draw essentials, in draw order, for `galaxyPointRenderer.draw()`. */
  entries(): IterableIterator<CatalogDrawEntry>;
  destroy(): void;
};
