/**
 * Per-source colour-index specs.
 *
 * Each survey carries different photometric bands in its five `magU/G/R/I/Z`
 * slots. Forcing every survey through SDSS-style u−g would clamp non-SDSS
 * colours to the unknown-colour sentinel (since they don't measure u-band)
 * and lose all galaxy-type information. Instead, this module picks the most
 * informative colour pair available *for each source* and normalises it onto
 * the 0..2 range the WGSL ramp expects.
 *
 * See the per-source table in docs/superpowers/plans/2026-05-03-per-source-colour-index.md
 * for the band choices and the rationale behind the K-correction coefficients.
 */

import { Source } from './sources';

/** Description of which colour-pair to use for one source. */
export type ColourIndexSpec = {
  /** Which two five-band slots feed the colour difference. */
  slotA: 'u' | 'g' | 'r' | 'i' | 'z';
  slotB: 'u' | 'g' | 'r' | 'i' | 'z';
  /** Natural range of (magA − magB) across galaxy types for this colour pair. */
  rangeMin: number;
  rangeMax: number;
  /** K-correction coefficient applied per unit redshift in the shader. */
  kPerZ: number;
};

const SPEC: Record<Source, ColourIndexSpec> = {
  [Source.SDSS]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  [Source.TwoMRS]: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
  [Source.Glade]: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
  [Source.Synthetic]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
};

/**
 * Look up which slot maps to which mag value, then compute the source-
 * appropriate colour index and K coefficient. Returns null when either
 * constituent band is NaN (so the caller knows to use the sentinel path).
 */
export function pickColourIndex(
  source: Source,
  magU: number,
  magG: number,
  magR: number,
  magI: number,
  magZ: number,
): { colourIndex: number; kPerZ: number } | null {
  const spec = SPEC[source];
  const slotMap = { u: magU, g: magG, r: magR, i: magI, z: magZ };
  const a = slotMap[spec.slotA];
  const b = slotMap[spec.slotB];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Normalise to 0..2 to match the shader's existing ramp() input range.
  // Clamp at both ends so outlier galaxies don't fall off the ramp colour.
  const raw = a - b;
  const normalised = ((raw - spec.rangeMin) / (spec.rangeMax - spec.rangeMin)) * 2.0;
  const colourIndex = Math.max(0, Math.min(2, normalised));
  return { colourIndex, kPerZ: spec.kPerZ };
}

/** Public read of the spec table — used by `galaxyType.ts` and tests. */
export function colourIndexSpec(source: Source): ColourIndexSpec {
  return SPEC[source];
}
