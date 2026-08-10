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

function estimateTwoMrs(input: StellarMassEstimateInput): number {
  const log10ML = Math.log10(0.6); // McGaugh & Schombert 2014 flat K-band M/L
  const absK = absoluteFromApparent(input.magI, input.distMpc); // 2MRS K_s lives in magI
  return log10StellarMass(log10ML, absK, 3.27);
}

function estimateGlade(input: StellarMassEstimateInput): number {
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

/** log10(stellar mass / solar mass), or NaN when this source/photometry can't yield one. */
export function estimateLog10StellarMass(input: StellarMassEstimateInput): number {
  switch (input.source) {
    case Source.SDSS:
      return estimateSdss(input);
    case Source.TwoMRS:
      return estimateTwoMrs(input);
    case Source.Glade:
    case Source.FamousGalaxy:
      return estimateGlade(input);
    default:
      return NaN;
  }
}
