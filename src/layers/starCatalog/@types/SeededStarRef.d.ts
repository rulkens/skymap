import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';

/** Where a seeded star sits in its own seed table: how a star pass finds its bodies among
 * the frame's scene bodies, by its own data. */
export type SeededStarRef = {
  /** The star show entry's item: the key into the star passes' handed value. */
  readonly item: SeededStarCatalogId;
  /** With `seedIndex`, the stable pick id: one table per source, never merged. */
  readonly source: StarCatalogSourceType;
  readonly seedIndex: number;
};
