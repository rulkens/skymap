import type { LonLatPolygons } from './LonLatPolygons';

/** Land the 1690 map gives one key: a province, a realm with no provinces, or
 * `UNCLAIMED_KEY` (paper: no wash, no border). */
export type RealmCell = {
  readonly key: string;
  readonly polygons: LonLatPolygons;
};
