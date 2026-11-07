import type { AntiqueTitleKey } from './AntiqueTitleKey';

/**
 * A part of the Earth with a title of its own (`ANTIQUE_EARTH_TITLE_REGIONS`):
 * taken when the plate's centre lies in one of its lon/lat boxes and the ground
 * under the eye is magnified past `kmPerUnit` (km per print unit, from → to).
 */
export type AntiqueTitleRegion = {
  readonly key: AntiqueTitleKey;
  /** Degrees, east and north positive: lon0, lon1, lat0, lat1. */
  readonly boxes: readonly (readonly [number, number, number, number])[];
  readonly kmPerUnit: readonly [number, number];
  /** The title fades to a blank cartouche within this many degrees of a box edge. */
  readonly marginDeg: number;
};
