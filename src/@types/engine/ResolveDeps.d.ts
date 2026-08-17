import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { StarCatalog } from '../data/starCatalog/StarCatalog';

/**
 * ResolveDeps — the engine resources the reconciler saga reads to turn a
 * SelectionRef into a SelectionRow. Bundled (not threaded individually) so the
 * saga gets the whole bag from `getContext('resolveDeps')()`. It mirrors the
 * existing pick-path `ResolvePickDeps` shape: live catalog lookup, the
 * famous-galaxies meta sidecar, and the structure store's by-id resolver. The
 * getters read LIVE engine state each call (the catalogs/structures change as
 * clouds load), so the saga always sees current data.
 */
export type ResolveDeps = {
  readonly catalogs: { get(source: GalaxyCatalogSourceType): GalaxyCatalog | undefined };
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
  readonly structures: { byId(id: string): StructureInfo | null };
  // The sole loaded star catalog (v1 ships one starCatalog source, the Gaia
  // bin). Reads LIVE engine state each call like the other getters — null
  // before the star cloud lands, so a star deep-link retries rather than
  // resolving against an empty catalog.
  readonly stars: { current(): StarCatalog | null };
};
