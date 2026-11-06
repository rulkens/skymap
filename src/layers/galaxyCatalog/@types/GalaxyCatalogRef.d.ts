import type { GalaxyCatalogSourceType } from './GalaxyCatalogSourceType';

/**
 * A galaxy's ref. POSITIONAL: `index` drifts on a tier swap, and the tier saga re-anchors by
 * durable id. Flat primitives only, as every ref in the RTK `selection` slice.
 */
export type GalaxyCatalogRef = {
  readonly type: 'galaxyCatalog';
  readonly source: GalaxyCatalogSourceType;
  readonly index: number;
};
