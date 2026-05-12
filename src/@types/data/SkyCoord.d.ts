/**
 * SkyCoord — RA hours, declination degrees, distance Mpc.
 *
 * The base shape used by the cluster / supercluster / void anchor
 * tables in `src/data/clusterAnchors.ts` and by their CF-4 audit
 * consumers.  RA in HOURS (not degrees) follows the astronomical
 * convention for catalogue tables; the standard `raHours * 15 *
 * π/180` conversion to radians lives in
 * `clusterAnchors.ts:raDecDistToEqCart`.
 */

/** Right-ascension hours, declination degrees, distance in Mpc. */
export type SkyCoord = {
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
};
