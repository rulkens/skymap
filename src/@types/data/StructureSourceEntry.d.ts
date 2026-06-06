import type { SourceEntryBase } from './SourceEntryBase';

/**
 * Structure-typed row of the SOURCE_REGISTRY — pick-decoding metadata for the
 * extended-structure codes (Cluster, Supercluster, Void, Group). Structures
 * have no `.bin` file, photometric bands, or survey depth, so the entry only
 * adds `code` to the shared base.
 *
 * Note `type: 'structure'`, not `'poi'`: famous galaxies are POIs too but ride
 * the `survey` entry, so the discriminator names exactly the marker-ring set.
 */
export type StructureSourceEntry = SourceEntryBase & {
  readonly type: 'structure';
  /** Stable numeric tag, matching the upper 5 bits of the packed pick ID. */
  readonly code: number;
};
