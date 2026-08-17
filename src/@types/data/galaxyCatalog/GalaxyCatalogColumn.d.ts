import type { GalaxyCatalog } from './GalaxyCatalog';

/**
 * Every typed-array column of `GalaxyCatalog` — the on-disk field set.
 * Excludes `count` (a scalar, not a column) and `medianAbsMag` (derived on
 * load, never persisted — see its doc on `GalaxyCatalog`).
 */
export type GalaxyCatalogColumn = Exclude<keyof GalaxyCatalog, 'count' | 'medianAbsMag'>;
