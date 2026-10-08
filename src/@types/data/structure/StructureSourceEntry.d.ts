import type { SourceEntryBase } from '../SourceEntryBase';
import type { StructureScale } from './StructureScale';

/**
 * Structure-typed SOURCE_REGISTRY row — the marker-ring codes (galaxy cluster,
 * supercluster, void, galaxy group, and the Milky Way ones). No `.bin`, bands, or
 * depth, so it just adds `code` to the base. The `'structure'` discriminator covers
 * exactly the marker-ring set: famousGalaxy is also clickable but rides the
 * `galaxyCatalog` entry, so it does not appear here.
 */
export type StructureSourceEntry = SourceEntryBase & {
  readonly type: 'structure';
  /** Stable numeric tag, matching the upper 6 bits of the packed pick ID. */
  readonly code: number;
  /**
   * Cosmic structures are regions of the galaxy distribution (their InfoCard counts
   * member galaxies); Milky Way structures sit inside our Galaxy. Picks the projection
   * slab via `SLAB_BY_STRUCTURE_SCALE`.
   */
  readonly scale: StructureScale;
};
