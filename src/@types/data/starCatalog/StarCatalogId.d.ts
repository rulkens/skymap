import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of star-catalog ids — the key domain for
 * `settings.starCatalogs.items`. Derived from the `type: 'starCatalog'`
 * registry rows, so a new star catalog widens the union automatically. Today
 * the sole member is `'gaiaStars'` (the survey-wide Gaia bin); the curated
 * famous-star map will add its own row later. The runtime iterable companion
 * is `STAR_CATALOG_IDS` in `data/starCatalog/starCatalogIds`.
 */
export type StarCatalogId = Extract<AnyEntry, { readonly type: 'starCatalog' }>['id'];
