/**
 * Unit tests for `hubbleVelocityKmS` — the v = c·z low-z recession velocity.
 *
 * Pure linear function; tests pin the boundary at z=0, the slope (=c), and
 * monotonicity.
 */

import { describe, it, expect } from 'vitest';
import { hubbleVelocityKmS } from '../../../src/utils/math/hubbleVelocityKmS';
import { C_KM_S } from '../../../src/utils/math/constants';

describe('hubbleVelocityKmS', () => {
  it('returns 0 km/s at z = 0 (no expansion for the present epoch)', () => {
    expect(hubbleVelocityKmS(0)).toBe(0);
  });

  it('returns exactly c × z (linear Hubble approximation)', () => {
    // The whole function body is `return C_KM_S * z`.  Pin a low-z value and
    // confirm the slope matches the speed-of-light constant.
    expect(hubbleVelocityKmS(0.1)).toBeCloseTo(C_KM_S * 0.1, 6);
  });

  it('reaches c at z = 1 (the naive non-relativistic boundary)', () => {
    // The classical Doppler approximation gives v = c at z = 1, even though
    // the full relativistic / cosmological treatment differs above z ~ 0.5.
    // We're testing the formula as documented, not its physical accuracy.
    expect(hubbleVelocityKmS(1)).toBeCloseTo(C_KM_S, 6);
  });

  it('is monotonically increasing in z', () => {
    // Linearity guarantees monotonicity, but we still spot-check across the
    // operative range to catch any sign-flip refactor regressions.
    let prev = -1;
    for (let z = 0; z <= 1; z += 0.05) {
      const v = hubbleVelocityKmS(z);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
