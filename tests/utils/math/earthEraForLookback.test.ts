/**
 * Unit tests for `earthEraForLookback` — the Gyr → Earth-history string lookup.
 *
 * The function is a pure cascade of `if (gyrAgo < boundary) return string`.
 * We test:
 *   - Boundaries are half-open [lower, upper): a value at exactly the boundary
 *     belongs to the *upper* band (the function uses strict `<`).
 *   - The very small (< 0.001 Gyr) and very large (> 13.7 Gyr) extremes return
 *     their dedicated sentinel strings.
 */

import { describe, it, expect } from 'vitest';
import { earthEraForLookback } from '../../../src/utils/math/earthEraForLookback';

describe('earthEraForLookback', () => {
  it('returns the modern-era string for 0 Gyr', () => {
    // The closest band is "essentially now (modern era)" for any value
    // < 0.001 Gyr (= 1 Myr).  z = 0 lookback always lands here.
    expect(earthEraForLookback(0)).toBe('essentially now (modern era)');
  });

  it('treats the boundary value as the start of the *upper* band (half-open)', () => {
    // 0.066 Gyr is exactly the K-Pg extinction boundary.  Per the docstring
    // the comparison is strict `<`, so 0.066 lies in the next-deeper band:
    // "before the dinosaurs went extinct".
    expect(earthEraForLookback(0.066)).toBe('before the dinosaurs went extinct');
  });

  it('returns the dawn-of-the-universe string for lookbacks beyond 13.7 Gyr', () => {
    // The final fall-through handles lookback > 13.7 Gyr, which is past the
    // current age of the universe — only achievable in the asymptotic limit
    // of the lookback approximation.
    expect(earthEraForLookback(14)).toBe('near the dawn of the universe');
  });
});
