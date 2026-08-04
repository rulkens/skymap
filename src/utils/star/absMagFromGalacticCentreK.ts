/**
 * Dereddened absolute K magnitude for a Galactic-Centre S-star:
 *   M_K = kMag − DM(8178 pc) − A_KS_GALACTIC_CENTRE
 * Reuses `absoluteMagnitude` for the modulus leg — 8178 pc through
 * `SCALE_UNITS.PC_TO_MPC` reproduces Gillessen+ 2017's quoted DM = 14.56.
 */
import { absoluteMagnitude } from '../math/absoluteMagnitude';
import { SCALE_UNITS } from '../../data/scaleUnits';

// R₀ = 8178 pc (Gillessen+ 2017, ApJ 837, 30) — the same distance the S-star
// elements (`sStarElements.ts`) scale their arcsec semi-major axes against.
const GALACTIC_CENTRE_DISTANCE_PC = 8178;

// A_Ks ≈ 2.5 mag toward the Galactic Centre (Fritz+ 2011, ApJ 737, 73). A
// MODELLING choice shared by all 39 stars, not a per-star measurement — kept
// its own constant rather than folded into the seed table.
export const A_KS_GALACTIC_CENTRE = 2.5;

export function absMagFromGalacticCentreK(kMag: number): number {
  const distanceMpc = GALACTIC_CENTRE_DISTANCE_PC * SCALE_UNITS.PC_TO_MPC;
  return absoluteMagnitude(kMag, distanceMpc) - A_KS_GALACTIC_CENTRE;
}
