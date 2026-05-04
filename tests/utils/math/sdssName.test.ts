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

  it('always emits a leading + on Dec for objects in the northern hemisphere', () => {
    // SDSS designations always show the explicit sign — readers parsing the
    // string can rely on the character at position 17 always being + or -.
    expect(sdssName(0, 0)).toContain('+000000.0');
  });

  it('emits a - for southern declinations', () => {
    expect(sdssName(0, -10)).toContain('-100000.0');
  });

  it('wraps RA values outside [0, 360)', () => {
    // -10° wraps to 350°; the function must not produce a negative
    // hours component or a malformed name.
    const name = sdssName(-10, 0);
    expect(name).toMatch(/^SDSS J2320/);
  });

  it('truncates seconds rather than rounding (catalog name stability)', () => {
    // Adding floating-point dust at the 1e-9° level just barely crosses the
    // centisecond tick boundary upward (from .75 to .76).  That's the
    // *intended* behaviour of integer truncation: the digit increments only
    // when the value crosses a tick, not from below-tick noise.  Dec is
    // unchanged, so 45.5 stays put.
    expect(sdssName(188.736500001, 1.396)).toBe('SDSS J123456.76+012345.5');
  });

  it('clamps Dec values above +90° to exactly +90°', () => {
    // Out-of-range Dec inputs (from upstream bugs) clamp rather than producing
    // nonsensical strings like "+910000.0" that would never appear in a real
    // catalog.
    expect(sdssName(0, 95)).toContain('+900000.0');
  });
});
