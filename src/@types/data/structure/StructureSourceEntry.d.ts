import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Structure-typed SOURCE_REGISTRY row — the marker-ring codes (Cluster,
 * Supercluster, Void, Group). No `.bin`, bands, or depth, so it just adds
 * `code` to the base. The `'structure'` discriminator covers exactly the
 * marker-ring set: famousGalaxy is also clickable but rides the `galaxyCatalog`
 * entry, so it does not appear here.
 */
export type StructureSourceEntry = SourceEntryBase & {
  readonly type: 'structure';
  /** Stable numeric tag, matching the upper 6 bits of the packed pick ID. */
  readonly code: number;
  /**
   * The projection slab whose marker pass draws this category: Mpc-scale
   * structures project through COSMO, parsec-scale ones need NEAR0's adaptive planes.
   */
  readonly slab: 'cosmo' | 'near0';
  /**
   * True when the category is a region of the extragalactic galaxy distribution:
   * focusing one dims non-member galaxies and its InfoCard counts members.
   */
  readonly galaxyMembers: boolean;
};
