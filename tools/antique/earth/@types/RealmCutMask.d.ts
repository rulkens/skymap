import type { LonLatPolygons } from './LonLatPolygons';

/** A `RealmCut1690` with its shape resolved to polygons (a closed hand ring, or
 * the assembled OHM relations). */
export type RealmCutMask = {
  readonly units: readonly string[];
  readonly target: string | null;
  readonly mask: LonLatPolygons;
};
