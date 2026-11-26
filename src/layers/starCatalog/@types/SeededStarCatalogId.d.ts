import type { StarCatalogRegistryEntry } from './StarCatalogRegistryEntry';

/**
 * The star catalogs built in code from seed tables rather than streamed from a
 * `.bin` — narrowed on `binBaseName: null`, the same signal the loader and the
 * asset-demand table read. The key domain of `SEEDED_STAR_CATALOGS`, whose
 * totality makes a new seeded row a compile error until it has a table.
 */
export type SeededStarCatalogId = Extract<
  StarCatalogRegistryEntry,
  { readonly binBaseName: null }
>['id'];
