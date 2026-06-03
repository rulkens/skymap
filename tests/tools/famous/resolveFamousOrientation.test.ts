/**
 * resolveFamousOrientation — per-field orientation resolution for the famous
 * catalog build.
 *
 * The seed often carries a real `axisRatio` (HyperLEDA logR25) but NO
 * `positionAngleDeg` — PA is genuinely unmeasured for face-on disks, which is
 * most of the famous showpieces.  The OLD build rule was all-or-nothing: it
 * baked real orientation only when BOTH fields were present, otherwise it
 * fabricated BOTH from `fallbackOrientation()` (a position hash).  That threw
 * away a correct axis ratio (e.g. M101's 0.96) and replaced it with a random
 * ~0.53 / 58° tilt.
 *
 * The fix resolves each field INDEPENDENTLY: keep every real measurement, fall
 * back only the genuinely-missing one.  The renderer's "is this a fallback
 * row?" detector keys on BOTH fields equalling the hash, so a real-axisRatio +
 * fallback-PA row is correctly treated as real (and a near-face-on disk's
 * arbitrary PA is visually irrelevant).
 */

import { describe, it, expect } from 'vitest';
import { resolveFamousOrientation } from '../../../tools/famous/resolveFamousOrientation';
import { fallbackOrientation } from '../../../src/utils/random/fallbackOrientation';

const OBJ = 36n;
const RA = 210.802368;
const DEC = 54.349023;
const FB = fallbackOrientation(OBJ, RA, DEC);

describe('resolveFamousOrientation', () => {
  it('keeps both real values when both are present', () => {
    const out = resolveFamousOrientation({
      axisRatio: 0.96,
      positionAngleDeg: 79,
      objID: OBJ,
      ra: RA,
      dec: DEC,
    });
    expect(out).toEqual({ axisRatio: 0.96, positionAngleDeg: 79 });
  });

  it('keeps a real axisRatio and falls back ONLY the missing PA (the M101 case)', () => {
    const out = resolveFamousOrientation({
      axisRatio: 0.96,
      positionAngleDeg: undefined,
      objID: OBJ,
      ra: RA,
      dec: DEC,
    });
    expect(out.axisRatio).toBe(0.96);
    expect(out.positionAngleDeg).toBe(FB.positionAngleDeg);
  });

  it('keeps a real PA and falls back ONLY the missing axisRatio', () => {
    const out = resolveFamousOrientation({
      axisRatio: undefined,
      positionAngleDeg: 130,
      objID: OBJ,
      ra: RA,
      dec: DEC,
    });
    expect(out.axisRatio).toBe(FB.axisRatio);
    expect(out.positionAngleDeg).toBe(130);
  });

  it('falls back both when neither is present', () => {
    const out = resolveFamousOrientation({
      axisRatio: undefined,
      positionAngleDeg: undefined,
      objID: OBJ,
      ra: RA,
      dec: DEC,
    });
    expect(out).toEqual({ axisRatio: FB.axisRatio, positionAngleDeg: FB.positionAngleDeg });
  });
});
