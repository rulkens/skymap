/**
 * One row of the POI_REGISTRY — display metadata for the point-of-interest
 * codes (Cluster, Supercluster, Void) used by the pick encoding. POIs don't
 * have a `.bin` file, photometric bands, or a survey depth, so the entry is
 * intentionally tiny.
 */
export type PoiEntry = {
  /** Stable numeric tag, matching the upper 5 bits of the packed pick ID. */
  readonly code: number;
  /** Display name shown in the InfoCard (e.g. `'Cluster'`, `'Void'`). */
  readonly label: string;
};
