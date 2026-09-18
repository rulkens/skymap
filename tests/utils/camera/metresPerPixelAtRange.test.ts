import { describe, it, expect } from 'vitest';

import { metresPerPixelAtRange } from '../../../src/utils/camera/metresPerPixelAtRange';

describe('metresPerPixelAtRange', () => {
  it('matches the closed form at a 90° FOV, where tan(fovY/2) = 1', () => {
    // Full vertical extent at range 1000 is 2·1000·tan(45°) = 2000 m over
    // 100 px, so one pixel covers 20 m — catches a dropped factor of 2.
    expect(metresPerPixelAtRange(1000, Math.PI / 2, 100)).toBeCloseTo(20, 9);
  });

  it('matches the closed form at an arbitrary FOV and viewport height', () => {
    // tan(fovY/2) = 0.5 by construction, so 2·100·0.5 / 50 = 2 — catches a
    // swapped range/height argument or a wrong tan-half-angle factor.
    expect(metresPerPixelAtRange(100, 2 * Math.atan(0.5), 50)).toBeCloseTo(2, 9);
  });
});
