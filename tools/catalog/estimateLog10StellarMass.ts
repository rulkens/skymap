/**
 * Per-source photometric stellar-mass estimator (Bell et al. 2003 colour–M/L
 * relations, McGaugh & Schombert 2014 for 2MRS). Build-side only — no runtime
 * consumer yet. Every branch is `log10 M* = log10(M/L) + 0.4*(M_sun - M)`
 * with `M = absoluteFromApparent(m, distMpc)`. NaN in (bad photometry, no
 * relation for this source, non-positive distance) always yields NaN out.
 */
import { absoluteFromApparent } from '../../src/utils/math/absoluteFromApparent';
import { Source } from '../../src/data/sources';
import type { SourceType } from '../../src/@types/data/SourceType';

export type StellarMassEstimateInput = {
  readonly source: SourceType;
  readonly magU: number;
  readonly magG: number;
  readonly magR: number;
  readonly magI: number;
  readonly magZ: number;
  /** Adopted distance in Mpc — the one the record's baked position uses. */
  readonly distMpc: number;
};

/**
 * Bell et al. 2003 Table 7 coefficients are calibrated for a "diet
 * Salpeter" IMF. The future MCPM-export step (Moster et al. 2013
 * stellar-to-halo conversion) assumes Kroupa/Chabrier, so every relation
 * below subtracts this — do not "simplify" it away, it is not slop.
 */
const DIET_SALPETER_TO_KROUPA_DEX = -0.15;

/** Assumed B-V colour for the GLADE single-band fallback (typical spiral).
 *  Dominant error term for those rows, ~0.3 dex — the reason a fallback
 *  exists at all rather than a second, colour-independent relation. */
const ASSUMED_BV_COLOR = 0.75;

function log10StellarMass(log10MassToLight: number, absMag: number, solarAbsMag: number): number {
  return log10MassToLight + 0.4 * (solarAbsMag - absMag);
}

function estimateSdss(input: StellarMassEstimateInput): number {
  const gr = input.magG - input.magR;
  const log10ML = -0.306 + 1.097 * gr + DIET_SALPETER_TO_KROUPA_DEX;
  const absR = absoluteFromApparent(input.magR, input.distMpc);
  return log10StellarMass(log10ML, absR, 4.65);
}

// Flat K-band M/L = 0.6 (McGaugh & Schombert 2014) — shared by 2MRS and
// GLADE's K branch below because both feed it a real 2MASS K magnitude;
// near-IR M/L is close to colour-independent, so one relation serves both.
const K_BAND_LOG10_ML = Math.log10(0.6);
const K_BAND_SOLAR_ABS_MAG = 3.27;

function estimateTwoMrs(input: StellarMassEstimateInput): number {
  const absK = absoluteFromApparent(input.magI, input.distMpc); // 2MRS K_s lives in magI
  return log10StellarMass(K_BAND_LOG10_ML, absK, K_BAND_SOLAR_ABS_MAG);
}

/** GLADE's real bands are B (magG) and 2MASS K (magZ) — magR holds 2MASS J,
 *  not V (see glade.ts's photometric mapping), so the Bell+03 B−V relation
 *  below is FamousGalaxy-only, where magR really is V (buildFamous.ts). */
function estimateGladeBV(input: StellarMassEstimateInput): number {
  const magB = input.magG;
  const magV = input.magR;
  const bFinite = Number.isFinite(magB);
  const vFinite = Number.isFinite(magV);

  if (bFinite && vFinite) {
    const bv = magB - magV;
    const log10ML = -0.942 + 1.737 * bv + DIET_SALPETER_TO_KROUPA_DEX;
    const absB = absoluteFromApparent(magB, input.distMpc);
    return log10StellarMass(log10ML, absB, 5.44);
  }
  if (bFinite) {
    const log10ML = -0.942 + 1.737 * ASSUMED_BV_COLOR + DIET_SALPETER_TO_KROUPA_DEX;
    const absB = absoluteFromApparent(magB, input.distMpc);
    return log10StellarMass(log10ML, absB, 5.44);
  }
  if (vFinite) {
    const log10ML = -0.628 + 1.305 * ASSUMED_BV_COLOR + DIET_SALPETER_TO_KROUPA_DEX;
    const absV = absoluteFromApparent(magV, input.distMpc);
    return log10StellarMass(log10ML, absV, 4.81);
  }
  return NaN;
}

/** GLADE has no V band (see glade.ts's photometric mapping: magG=B, magZ=K).
 *  K-first because near-IR M/L is the physically better estimator; falls
 *  back to the single-band B relation (assumed B−V=0.75) only when K is
 *  missing, which the real catalog leaves as the majority of coverage. */
function estimateGlade(input: StellarMassEstimateInput): number {
  const magK = input.magZ; // GLADE's 2MASS K lives in magZ, not magI
  if (Number.isFinite(magK)) {
    const absK = absoluteFromApparent(magK, input.distMpc);
    return log10StellarMass(K_BAND_LOG10_ML, absK, K_BAND_SOLAR_ABS_MAG);
  }
  const magB = input.magG;
  if (Number.isFinite(magB)) {
    const log10ML = -0.942 + 1.737 * ASSUMED_BV_COLOR + DIET_SALPETER_TO_KROUPA_DEX;
    const absB = absoluteFromApparent(magB, input.distMpc);
    return log10StellarMass(log10ML, absB, 5.44);
  }
  return NaN;
}

/** log10(stellar mass / solar mass), or NaN when this source/photometry can't yield one. */
export function estimateLog10StellarMass(input: StellarMassEstimateInput): number {
  switch (input.source) {
    case Source.SDSS:
      return estimateSdss(input);
    case Source.TwoMRS:
      return estimateTwoMrs(input);
    case Source.Glade:
      return estimateGlade(input);
    case Source.FamousGalaxy:
      return estimateGladeBV(input);
    default:
      return NaN;
  }
}
