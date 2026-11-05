/**
 * SkyCoord — RA hours, declination degrees, distance Mpc.
 *
 * Position shape `raDecDistToEqCart` reads. Seed rows carry unit-tagged
 * `Length`s; callers convert with `lengthToMpc` before building one.
 * RA in HOURS (not degrees) follows the astronomical convention for
 * catalogue tables; the standard
 * `raHours * 15 * π/180` conversion to radians lives in
 * `src/utils/math/raDecDistToEqCart.ts`.
 */

/** Right-ascension hours, declination degrees, distance in Mpc. */
export type SkyCoord = {
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
};
