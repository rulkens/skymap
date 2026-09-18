/** GroundSample — one drawn-ground height at an (east, north) offset, metres,
 *  from a site on its local horizon. */
export type GroundSample = {
  readonly eastM: number;
  readonly northM: number;
  readonly heightM: number;
};
