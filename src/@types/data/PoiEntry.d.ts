import type { SourceEntryBase } from './SourceEntryBase';

/**
 * POI-typed row of the SOURCE_REGISTRY — pick-decoding metadata for the
 * point-of-interest codes (Cluster, Supercluster, Void). POIs have no
 * `.bin` file, photometric bands, or survey depth, so the entry only adds
 * `code` to the shared base.
 */
export type PoiEntry = SourceEntryBase & {
  readonly type: 'poi';
  /** Stable numeric tag, matching the upper 5 bits of the packed pick ID. */
  readonly code: number;
};
