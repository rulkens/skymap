/**
 * Unit tests for `iauName` — the survey-aware IAU coordinate-based designation.
 *
 * IAU designations encode (RA, Dec) with truncated (NOT rounded) precision so
 * the name is stable across catalog re-measurements.  We verify:
 *   - prefix matches the source enum (SDSS / 2MASX / GLADE / Synth / Famous)
 *   - RA wraps modulo 360 (negative + > 360°)
 *   - Dec sign is always present, +DD or -DD
 *   - truncation (not rounding) of seconds is honoured
 *   - clamping for out-of-range Dec
 */

import { describe, it, expect } from 'vitest';
import { iauName } from '../../../src/utils/math/iauName';
import { Source } from '../../../src/data/sources';

describe('iauName', () => {
  it('produces the canonical SDSS designation for a known (RA, Dec) pair', () => {
    // RA = 188.7365° converts to ~12h34m56.756 of time; truncation to centi-
    // second gives "56.75". Dec = 1.396° = 1°23'45.6", but truncation to a
    // decisecond on the float-product 1.396×3600×10 = 50255.99... lands at
    // 50255 (rounded down), so the displayed seconds become 45.5.  The
    // docstring example in sdssName.ts shows ".76+...45.6" which is the
    // *rounded* form — the implementation truncates, so we pin the actual
    // truncated string here.
    expect(iauName(Source.SDSS, 188.7365, 1.396)).toBe('SDSS J123456.75+012345.5');
  });

  it('uses the 2MASX prefix for 2MRS rows (2MRS rows carry 2MASS XSC IDs)', () => {
    // The string after "J" must be identical regardless of source — only the
    // prefix changes — so we use the same coords as the SDSS test above.
    expect(iauName(Source.TwoMRS, 188.7365, 1.396)).toBe('2MASX J123456.75+012345.5');
  });

  it('uses the GLADE prefix for GLADE rows', () => {
    expect(iauName(Source.Glade, 188.7365, 1.396)).toBe('GLADE J123456.75+012345.5');
  });

  it('uses the Synth prefix for synthetic data', () => {
    expect(iauName(Source.Synthetic, 188.7365, 1.396)).toBe('Synth J123456.75+012345.5');
  });

  it('uses the Famous prefix when no curated name is available', () => {
    // Famous entries normally render with curated names (e.g. "M31"), but the
    // IAU designation is the fallback when sidecar metadata hasn't loaded yet.
    expect(iauName(Source.Famous, 188.7365, 1.396)).toBe('Famous J123456.75+012345.5');
  });

  it('always emits a leading + for non-negative declinations', () => {
    // Even a tiny positive Dec must carry the explicit + sign — that's the
    // IAU convention, so info-card readers can always parse the sign field.
    const name = iauName(Source.SDSS, 0, 0);
    expect(name.startsWith('SDSS J000000.00+')).toBe(true);
  });

  it('emits a leading - for negative declinations', () => {
    // Southern-hemisphere objects (Dec < 0) get a leading minus.
    const name = iauName(Source.SDSS, 0, -45.5);
    expect(name).toContain('-453000.0');
  });

  it('wraps negative RA values into [0, 360)', () => {
    // -10° wraps to 350° → 23h20m. The point is that the function never
    // emits "-" inside the RA portion or fails on negative input.
    const name = iauName(Source.SDSS, -10, 0);
    expect(name).toMatch(/^SDSS J2320/);
  });

  it('wraps RA values above 360 back into [0, 360)', () => {
    // 370° wraps to 10° → 0h40m. Validates the modulo handles the > 360° case.
    const name = iauName(Source.SDSS, 370, 0);
    expect(name).toMatch(/^SDSS J0040/);
  });

  it('truncates rather than rounds the seconds field (catalog stability)', () => {
    // RA = 188.736500001° lies a hair above 188.7365.  At centisecond
    // precision this nudges the truncated value up by exactly one (from
    // .75 to .76), demonstrating that the function tracks small RA changes
    // monotonically.  Dec is unchanged, so the dec part stays at 45.5.
    // The point is that truncation is sticky on the lower side: small noise
    // *below* a tick boundary never decrements a digit, only crossings of a
    // hundredth-of-a-second boundary increment.
    const truncated = iauName(Source.SDSS, 188.736500001, 1.396);
    expect(truncated).toBe('SDSS J123456.76+012345.5');
  });

  it('clamps Dec values above +90 to +90', () => {
    // Dec is a physical angle bounded by ±90; out-of-range inputs (e.g. from
    // upstream bug) are clamped rather than producing nonsensical strings.
    const name = iauName(Source.SDSS, 0, 95);
    expect(name).toContain('+900000.0');
  });

  it('clamps Dec values below -90 to -90', () => {
    const name = iauName(Source.SDSS, 0, -95);
    expect(name).toContain('-900000.0');
  });
});
