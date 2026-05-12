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
import type { ColourIndexSpec } from '../@types/data/ColourIndexSpec';

const SPEC: Record<Source, ColourIndexSpec> = {
  [Source.SDSS]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  [Source.TwoMRS]: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
  [Source.Glade]: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
  [Source.Synthetic]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  // Famous entries carry curated optical photometry in SDSS-style slots
  // (see BAND_LABELS in sources.ts).  Mirror the SDSS spec so the colour
  // ramp maps g−r cleanly; kPerZ = 0 since these are all very nearby
  // (z < 0.05) and need no K-correction.
  [Source.Famous]: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 0.0 },
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

  // ── Normalise raw colour to the 0..2 ramp range ─────────────────────────
  //
  // The WGSL ramp expects its input in [0, 2].  We pre-bake the linear
  // remap here so the shader doesn't need to know any per-source range
  // numbers — it just reads a single f32 and indexes the ramp.
  //
  // kPerZ is passed through unchanged: it's already specified in
  // normalised ramp-position units (see the SPEC type's docstring for
  // why the literature mag/z values aren't used directly).
  const raw = a - b;
  const colourIndex = Math.max(
    0,
    Math.min(2, ((raw - spec.rangeMin) / (spec.rangeMax - spec.rangeMin)) * 2.0),
  );
  return { colourIndex, kPerZ: spec.kPerZ };
}

/** Public read of the spec table — used by `galaxyType.ts` and tests. */
export function colourIndexSpec(source: Source): ColourIndexSpec {
  return SPEC[source];
}
