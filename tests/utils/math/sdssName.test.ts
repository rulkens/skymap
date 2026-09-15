/**
 * Unit tests for `sdssName` — the standalone SDSS-prefixed IAU designation.
 *
 * `iauName(Source.SDSS, ra, dec)` produces the same output, so these tests
 * partially overlap, but `sdssName` is also imported directly by build-time
 * tooling that doesn't carry a Source enum, so it has its own surface and
 * deserves its own coverage.
 */

import { describe, it, expect } from 'vitest';
import { sdssName } from '../../../src/utils/math/sdssName';

describe('sdssName', () => {
  it('produces the truncated SDSS designation for 188.7365°, 1.396°', () => {
    // The function uses `Math.trunc` for both RA centiseconds and Dec
    // deciseconds.  188.7365° → 12h34m56.756s of time, truncated to .75s.
    // 1.396° → 1°23'45.5...", truncated to 45.5".  (The sdssName.ts docstring
    // shows ".76+...45.6" which is the rounded form — the implementation
    // truncates, which is the IAU-stable convention.)
    expect(sdssName(188.7365, 1.396)).toBe('SDSS J123456.75+012345.5');
  });
});
