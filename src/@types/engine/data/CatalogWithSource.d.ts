import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';

/**
 * One catalog tagged with its galaxy catalog source. The source is needed
 * at the call boundary because the catalog itself is source-agnostic — it's
 * the same `GalaxyCatalog` shape regardless of which galaxy catalog
 * produced it. The caller assembles the list from the engine's
 * `galaxyStore` catalogs map.  Input to `structureMembership`.
 */
export type CatalogWithSource = {
  readonly source: SourceType;
  readonly catalog: GalaxyCatalog;
};
