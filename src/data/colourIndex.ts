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

import { Source, type SurveySource } from './sources';
import type { ColourIndexSpec } from '../@types/data/ColourIndexSpec';
import { distanceMpcToRedshift } from '../utils/math/distanceMpcToRedshift';

/**
 * Ramp-position fallback for rows whose colour cannot be computed (one
 * or both bands missing). 1.05 is a deliberately pale, neutral position
 * on the 0..2 ramp — close enough to the middle that sentinel rows
 * don't draw the eye away from real colour gradients. Both the points
 * bake and the procedural-disk subsystem substitute this value, so a
 * galaxy without bands renders the same hue in both renderers.
 */
export const UNKNOWN_COLOUR_RAMP_POSITION = 1.05;

// POI source codes (Cluster, Supercluster, Void) have no photometry —
// they're pick-encoding-only markers, not survey rows. The colour-index
// spec is therefore keyed by `SurveySource` (excludes POIs), and the
// accessors below treat a POI input as a programming error: the points
// pipeline that computes colour indices should never see a POI source.
const SPEC: Record<SurveySource, ColourIndexSpec> = {
  [Source.SDSS]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  [Source.TwoMRS]: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
  [Source.Glade]: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
  [Source.Synthetic]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  // Famous entries carry curated optical photometry in SDSS-style slots
  // (see BAND_LABELS in sources.ts).  Mirror the SDSS spec so the colour
  // ramp maps g−r cleanly; kPerZ = 0 since these are all very nearby
  // (z < 0.05) and need no K-correction.
  [Source.Famous]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 0.0 },
  // Milliquas carries B (in the g slot) and R (in the r slot). B−R is
  // the natural quasar colour: blue quasars (continuum-dominated, low z)
  // sit near B−R ≈ 0, while red quasars / dust-obscured AGN extend to
  // B−R ≳ 2. kPerZ is non-zero because quasar spectra are emission-line
  // dominated and high-z observed-frame B−R sweeps the Lyα forest, but
  // we keep the value modest until the full bias-correction subsystem
  // wires Milliquas in.
  [Source.Milliquas]: { slotA: 'g', slotB: 'r', rangeMin: 0.0, rangeMax: 2.0, kPerZ: 0.5 },
};

/**
 * Look up which slot maps to which mag value, compute the source-
 * appropriate colour index, K-correct it to rest-frame using the row's
 * distance, and normalise to the 0..2 ramp range. Returns
 * {@link UNKNOWN_COLOUR_RAMP_POSITION} when either constituent band is
 * NaN, so callers never need a null-check or fallback constant.
 *
 * The K-correction is applied here (CPU side) so both consumers
 * (`buildPointInterleavedBuffer` and `proceduralDiskSubsystem`) get the
 * same rest-frame value, removing a visible hue mismatch between the
 * points pass and the procedural-disk impostor for the same galaxy.
 */
export function pickColourIndex(
  source: Source,
  magU: number,
  magG: number,
  magR: number,
  magI: number,
  magZ: number,
  dMpcFromOrigin: number,
): number {
  if (source === Source.Cluster || source === Source.Supercluster || source === Source.Void) {
    throw new Error(`pickColourIndex: POI source ${source} has no colour index`);
  }
  const spec = SPEC[source as SurveySource];
  const slotMap = { u: magU, g: magG, r: magR, i: magI, z: magZ };
  const a = slotMap[spec.slotA];
  const b = slotMap[spec.slotB];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return UNKNOWN_COLOUR_RAMP_POSITION;

  // Normalise raw observed colour to the 0..2 ramp range. The WGSL ramp
  // expects its input there; pre-baking the linear remap means the
  // shader reads a single f32 and indexes the ramp.
  const raw = a - b;
  const observedCI = ((raw - spec.rangeMin) / (spec.rangeMax - spec.rangeMin)) * 2.0;

  // K-correction: colour_rest ≈ colour_obs − k · z. kPerZ is already in
  // normalised ramp-position units, so the subtraction happens directly
  // on the ramp coordinate. Re-clamp because the correction can push
  // the value outside [0, 2].
  const z = distanceMpcToRedshift(dMpcFromOrigin);
  const restCI = observedCI - spec.kPerZ * z;
  return Math.max(0, Math.min(2, restCI));
}

/** Public read of the spec table — used by `galaxyType.ts` and tests. */
export function colourIndexSpec(source: Source): ColourIndexSpec {
  if (source === Source.Cluster || source === Source.Supercluster || source === Source.Void) {
    throw new Error(`colourIndexSpec: POI source ${source} has no colour-index spec`);
  }
  return SPEC[source as SurveySource];
}
