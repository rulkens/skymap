/**
 * SkyCoord — RA hours, declination degrees, distance Mpc.
 *
 * Base shape used by `data/seeds/structure_anchors.seed.json` entries and
 * their CF-4 audit consumers.  RA in HOURS (not degrees) follows the
 * astronomical convention for catalogue tables; the standard
 * `raHours * 15 * π/180` conversion to radians lives in
 * `src/utils/math/raDecDistToEqCart.ts`.
 */

/** Right-ascension hours, declination degrees, distance in Mpc. */
export type SkyCoord = {
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
};
