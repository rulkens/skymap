/**
 * SchechterInput — input to the Schechter-density integrator
 * (`src/utils/math/schechterDensity.ts:expectedNumberDensity`).
 *
 * Carries the Schechter triple `(M*, α, φ*)` plus the galaxy catalog flux limit
 * and the distance at which to evaluate density.  See the runtime
 * function's docblock for the integration scheme.
 */
export type SchechterInput = {
  /** Schechter characteristic absolute magnitude M*. */
  mStar: number;
  /** Schechter faint-end slope α (typically −1 to −1.3). */
  alpha: number;
  /** Schechter normalisation φ* in galaxies per Mpc³. */
  phiStar: number;
  /** Galaxy catalog apparent-magnitude flux limit. */
  mLim: number;
  /** Distance to evaluate density at, in Mpc. */
  dMpc: number;
};
