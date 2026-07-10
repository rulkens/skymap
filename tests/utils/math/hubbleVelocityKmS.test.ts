/**
 * Unit tests for `hubbleVelocityKmS` — the v = c·z low-z recession velocity.
 *
 * Pure linear function; tests pin the boundary at z=0 and the c-at-z=1 anchor.
 */

import { describe, it, expect } from 'vitest';
import { hubbleVelocityKmS } from '../../../src/utils/math/hubbleVelocityKmS';
import { C_KM_S } from '../../../src/utils/math/constants';

describe('hubbleVelocityKmS', () => {
  it('returns 0 km/s at z = 0 (no expansion for the present epoch)', () => {
    expect(hubbleVelocityKmS(0)).toBe(0);
  });

  it('reaches c at z = 1 (the naive non-relativistic boundary)', () => {
    // The classical Doppler approximation gives v = c at z = 1, even though
    // the full relativistic / cosmological treatment differs above z ~ 0.5.
    // We're testing the formula as documented, not its physical accuracy.
    expect(hubbleVelocityKmS(1)).toBeCloseTo(C_KM_S, 6);
  });
});
