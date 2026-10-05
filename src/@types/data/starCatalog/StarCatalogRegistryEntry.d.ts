import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * A star-catalog entry as the registry declares it, with `code` and `id` at
 * their literal unions (`StarCatalogSourceEntry` widens them to number/string).
 * Derived from the registry, so adding a catalog widens the union automatically.
 */
export type StarCatalogRegistryEntry = Extract<AnyEntry, { readonly type: 'starCatalog' }>;
