import type { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
type AnyEntry = (typeof APP_SOURCE_REGISTRY)[keyof typeof APP_SOURCE_REGISTRY];

/**
 * A star-catalog entry as the registry declares it, with `code` and `id` at
 * their literal unions (`StarCatalogSourceEntry` widens them to number/string).
 * Derived from the registry, so adding a catalog widens the union automatically.
 */
export type StarCatalogRegistryEntry = Extract<AnyEntry, { readonly type: 'starCatalog' }>;
