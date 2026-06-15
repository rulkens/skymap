/**
 * Per-source colour-index computation.
 *
 * Each galaxy catalog carries different photometric bands in its five `magU/G/R/I/Z`
 * slots. Forcing every galaxy catalog through SDSS-style u−g would clamp non-SDSS
 * colours to the unknown-colour sentinel and lose all galaxy-type
 * information. The per-source recipe lives on each entry's `colourSpec`
 * field in `SOURCE_REGISTRY`; this module normalises the result onto the
 * 0..2 range the WGSL ramp expects.
 *
 * See `docs/superpowers/plans/2026-05-03-per-source-colour-index.md` for
 * the band choices and the K-correction-coefficient rationale.
 */

import { SOURCE_REGISTRY } from '../sources';
import type { SourceType } from '../../@types/data/SourceType';
import { distanceMpcToRedshift } from '../../utils/math/distanceMpcToRedshift';

/**
 * Ramp-position fallback for rows whose colour cannot be computed (one
 * or both bands missing). 1.05 is a deliberately pale, neutral position
 * on the 0..2 ramp — close enough to the middle that sentinel rows
 * don't draw the eye away from real colour gradients. Both the points
 * bake and the procedural-disk subsystem substitute this value, so a
 * galaxy without bands renders the same hue in both renderers.
 */
export const UNKNOWN_COLOUR_RAMP_POSITION = 1.05;

/**
 * Look up the source's colour-index recipe, compute the observed colour,
 * K-correct it to rest-frame using the row's distance, and normalise to
 * the 0..2 ramp range. Returns {@link UNKNOWN_COLOUR_RAMP_POSITION} when
 * either constituent band is NaN.
 *
 * The K-correction is applied here (CPU side) so both consumers
 * (`buildPointInterleavedBuffer` and `proceduralDiskSubsystem`) get the
 * same rest-frame value, removing a visible hue mismatch between the
 * points pass and the procedural-disk impostor for the same galaxy.
 */
export function pickColourIndex(
  source: SourceType,
  magU: number,
  magG: number,
  magR: number,
  magI: number,
  magZ: number,
  dMpcFromOrigin: number,
): number {
  const entry = SOURCE_REGISTRY[source];
  // The points pipeline only routes galaxy catalog sources here; any other
  // kind (structure, filament, volume) hitting this path means a
  // picker/dispatch bug upstream.
  if (entry.type !== 'galaxyCatalog') {
    throw new Error(`pickColourIndex: non-galaxy catalog source ${source} has no colour index`);
  }
  const spec = entry.colourSpec;
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
