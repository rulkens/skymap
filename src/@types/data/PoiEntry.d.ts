/**
 * POI-typed row of the SOURCE_REGISTRY — display metadata for the
 * point-of-interest codes (Cluster, Supercluster, Void) used by the pick
 * encoding. POIs have no `.bin` file, photometric bands, or survey depth, so
 * the entry is intentionally tiny.
 */
export type PoiEntry = {
  readonly type: 'poi';
  /** Stable numeric tag, matching the upper 5 bits of the packed pick ID. */
  readonly code: number;
  /** Display name shown in the InfoCard (e.g. `'Cluster'`, `'Void'`). */
  readonly label: string;
};
