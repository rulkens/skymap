import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';

/**
 * GalaxyStore — the authoritative app-side home for galaxy data.
 *
 * Galaxies arrive as decoded `GalaxyCatalog`s (one per galaxy catalog `Source`)
 * plus the optional `famousMeta` sidecar that enriches the Famous
 * catalog's InfoCard text. Before per-type stores these lived on
 * `state.sources.catalogs` / `state.sources.famousMeta`; consolidating
 * them here gives every galaxy consumer (InfoCard, picking, the famous
 * label join, bias correction) one obvious place to read from.
 *
 * The store exposes READ-ONLY views (`catalogs` as a `ReadonlyMap`,
 * `famousMeta` as a `readonly` array) and mutates only through its
 * setters. Writers are the slot commits; everyone else reads. This keeps
 * mutation concentrated at the load boundary rather than scattered across
 * consumers — the immutability-leaning shape the rest of the engine
 * favours, without paying for per-frame copies on the GPU hot path.
 */
export type GalaxyStore = {
  /** CPU-side mirror of every uploaded catalog, keyed by galaxy catalog `Source`. */
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  /** Famous-catalog metadata sidecar; empty until the fetch resolves. */
  readonly famousMeta: readonly FamousMetaEntry[];
  /** Install (or replace) the catalog for a source. */
  setCatalog(source: SourceType, catalog: GalaxyCatalog): void;
  /** Drop a source's catalog (e.g. on tier reload). */
  removeCatalog(source: SourceType): void;
  /** Look up a source's catalog, or undefined if not loaded. */
  get(source: SourceType): GalaxyCatalog | undefined;
  /** Replace the famous-meta sidecar wholesale. */
  setFamousMeta(meta: readonly FamousMetaEntry[]): void;
};
