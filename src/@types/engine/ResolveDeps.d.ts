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
  // `loaded` is OPTIONAL rather than folded into the Pick: it exists only for
  // `watchFocusTweenSaga`'s retry loop (true once the anchors group has landed,
  // synchronously ahead of the async bulk group — the structure analogue of
  // `stars.current() === null`), and making it required would force every
  // other ResolveDeps stub in the test suite (none of which exercise structure
  // deferral) to grow a field they don't use. A stub that omits it is treated
  // as already-loaded by the loop, matching today's no-retry behaviour.
  readonly structures: Pick<StructureStore, 'byId' | 'byCategory'> & {
    loaded?(): boolean;
  };
  // The sole loaded star catalog (v1 ships one starCatalog source, the Gaia
  // bin). Reads LIVE engine state each call like the other getters — null
  // before the star cloud lands, so a star deep-link retries rather than
  // resolving against an empty catalog.
  readonly stars: { current(): StarCatalog | null };
};
