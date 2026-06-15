import { SOURCE_REGISTRY } from '../../data/sources';

/**
 * Source codes whose `SOURCE_REGISTRY` entry has `type: 'galaxyCatalog'` —
 * derived from the registry rather than listed explicitly, so adding
 * a galaxy catalog is a single-place edit (the new registry entry) and no
 * exclusion list needs updating when a new kind is added.
 */
export type GalaxyCatalogSource = {
  [K in keyof typeof SOURCE_REGISTRY]: (typeof SOURCE_REGISTRY)[K] extends { type: 'galaxyCatalog' }
    ? (typeof SOURCE_REGISTRY)[K]['code']
    : never;
}[keyof typeof SOURCE_REGISTRY];
