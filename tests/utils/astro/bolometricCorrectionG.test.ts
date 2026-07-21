import { describe, expect, it } from 'vitest';

import { bolometricCorrectionG } from '../../../src/utils/astro/bolometricCorrectionG';

// The Andrae+18 quartic is pinned to ΔT = T − 5772. At the anchor T = 5772 it
// collapses to the constant term (0.06). The clamp to [4000, 8000] is the
// load-bearing behaviour — the paper's sub-4000 K coefficient set is a known
// erratum (see the util docblock), so the util must never evaluate below 4000.
describe('bolometricCorrectionG', () => {
  it('returns the constant term at the solar anchor temperature', () => {
    expect(bolometricCorrectionG(5772)).toBeCloseTo(0.06, 10);
  });

  it('reads a large negative correction for a cool star', () => {
    expect(bolometricCorrectionG(4000)).toBeCloseTo(-0.49802, 4);
  });

  it('clamps below 4000 K to the 4000 K value (avoids the erratum coefficients)', () => {
    expect(bolometricCorrectionG(3000)).toBeCloseTo(bolometricCorrectionG(4000), 10);
  });

  it('clamps above 8000 K to the 8000 K value', () => {
    expect(bolometricCorrectionG(9000)).toBeCloseTo(bolometricCorrectionG(8000), 10);
  });
});
