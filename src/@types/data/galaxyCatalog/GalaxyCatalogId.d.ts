import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of galaxy-catalog ids — the key domain for
 * `settings.galaxyCatalogs.items`. Derived from the `type: 'galaxyCatalog'`
 * registry rows, so a new catalog widens the union automatically. The runtime
 * iterable companion is `GALAXY_CATALOG_IDS` in `data/galaxyCatalog/galaxyCatalogIds`.
 */
export type GalaxyCatalogId = Extract<AnyEntry, { readonly type: 'galaxyCatalog' }>['id'];
