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
};
