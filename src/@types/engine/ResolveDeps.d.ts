// src/@types/engine/ResolveDeps.d.ts
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { StructureInfo } from '../data/structure/StructureInfo';

/**
 * ResolveDeps — the engine resources the reconciler saga reads to turn a
 * SelectionRef into a SelectionRow. Bundled (not threaded individually) so the
 * saga gets the whole bag from `getContext('resolveDeps')()`. It mirrors the
 * existing pick-path `ResolvePickDeps` shape: live catalog lookup, the
 * famous-meta sidecar, and the structure store's by-id resolver. The getters
 * read LIVE engine state each call (the catalogs/structures change as clouds
 * load), so the saga always sees current data.
 */
export type ResolveDeps = {
  readonly catalogs: { get(source: GalaxyCatalogSourceType): GalaxyCatalog | undefined };
  readonly famousMeta: readonly FamousMetaEntry[];
  readonly structures: { byId(id: string): StructureInfo | null };
};
