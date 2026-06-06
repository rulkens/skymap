import type { SourceEntryBase } from './SourceEntryBase';

/**
 * Structure-typed SOURCE_REGISTRY row — the marker-ring codes (Cluster,
 * Supercluster, Void, Group). No `.bin`, bands, or depth, so it just adds
 * `code` to the base. Named `'structure'`, not `'poi'`: famousGalaxy is a POI
 * too but rides the `survey` entry, so this discriminator is exactly the
 * marker-ring set.
 */
export type StructureSourceEntry = SourceEntryBase & {
  readonly type: 'structure';
  /** Stable numeric tag, matching the upper 5 bits of the packed pick ID. */
  readonly code: number;
};
