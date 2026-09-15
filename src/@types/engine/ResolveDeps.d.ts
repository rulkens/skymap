import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { StructureStore } from './data/StructureStore';
import type { StarCatalog } from '../data/starCatalog/StarCatalog';

/**
 * ResolveDeps — the engine resources the six core `SelectionKindRow`s close
 * over: live catalog lookup, the famous-galaxies meta sidecar, the structure
 * store, and the loaded star catalog. Bundled (not threaded individually) so
 * the saga gets the whole bag from `getContext('resolveDeps')()`. The getters
 * read LIVE engine state each call (the catalogs/structures change as clouds
 * load), so a row always sees current data.
 */
export type ResolveDeps = {
  readonly catalogs: { get(source: GalaxyCatalogSourceType): GalaxyCatalog | undefined };
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
  // Widened to the two methods the structure selection row needs (Ruling 5):
  // `resolveStructureFromPick` reads `byCategory`, `extractRow` reads `byId`.
  readonly structures: Pick<StructureStore, 'byId' | 'byCategory'>;
  // The sole loaded star catalog (v1 ships one starCatalog source, the Gaia
  // bin). Reads LIVE engine state each call like the other getters — null
  // before the star cloud lands, so a star deep-link retries rather than
  // resolving against an empty catalog.
  readonly stars: { current(): StarCatalog | null };
};
