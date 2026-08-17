import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';

/**
 * GalaxyStore — the authoritative app-side home for galaxy data.
 *
 * Galaxies arrive as decoded `GalaxyCatalog`s, one per galaxy catalog
 * `Source`. Before per-type stores these lived on `state.sources.catalogs`;
 * consolidating them here gives every galaxy consumer (InfoCard, picking,
 * the famous label join, bias correction) one obvious place to read from.
 *
 * The store exposes a READ-ONLY view (`catalogs` as a `ReadonlyMap`) and
 * mutates only through its setters. Writers are the slot commits; everyone
 * else reads. This keeps mutation concentrated at the load boundary rather
 * than scattered across consumers — the immutability-leaning shape the rest
 * of the engine favours, without paying for per-frame copies on the GPU hot
 * path.
 */
export type GalaxyStore = {
  /** CPU-side mirror of every uploaded catalog, keyed by galaxy catalog `Source`. */
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  /** Install (or replace) the catalog for a source. */
  setCatalog(source: SourceType, catalog: GalaxyCatalog): void;
  /** Drop a source's catalog (e.g. on tier reload). */
  removeCatalog(source: SourceType): void;
  /** Look up a source's catalog, or undefined if not loaded. */
  get(source: SourceType): GalaxyCatalog | undefined;
};
