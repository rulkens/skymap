/** A border between 1690 cells, lon/lat degrees: rank 1 between sovereigns, 2
 * between realms of one empire, 3 between provinces of one realm. `coastal`
 * flags an end that stops on a coast (start, end). */
export type BorderPolyline = {
  readonly rank: number;
  readonly points: readonly (readonly [number, number])[];
  readonly coastal: readonly [boolean, boolean];
};
