import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * Source CODES whose registry entry has `type: 'galaxyCatalog'` — the numeric
 * twin of `GalaxyCatalogId`, the same way `SourceType` is the code twin of
 * `SourceId`. Derived from the registry, so adding a galaxy catalog widens the
 * union automatically (no exclusion list to maintain).
 */
export type GalaxyCatalogSourceType = Extract<AnyEntry, { readonly type: 'galaxyCatalog' }>['code'];
