import type { LonLatPolygons } from './LonLatPolygons';

/** One Natural Earth admin-1 unit with the codes `REALM_RULES_1690` matches on. */
export type AdminUnit = {
  /** ISO 3166-2 code, e.g. 'NL-NH'; '' for the few units without one. */
  readonly iso: string;
  readonly adm0: string;
  readonly geonunit: string;
  readonly polygons: LonLatPolygons;
};
