/**
 * Unit tests for the internal sexagesimal helpers.
 *
 * These functions aren't part of the public math barrel (the leading underscore
 * makes that clear), but they're imported by `formatRaSexagesimal`,
 * `formatDecSexagesimal`, `sdssName`, and `iauName`.  Since those public
 * formatters delegate the heavy lifting here, a regression in `pad` or
 * `decomposeSexagesimal*` would cascade through every coordinate string the
 * UI displays — worth pinning the contract directly.
 */

import { describe, it, expect } from 'vitest';
import {
  pad,
  decomposeSexagesimal,
  decomposeSexagesimalTrunc,
} from '../../../src/utils/math/_sexagesimal';

describe('pad', () => {
  it('zero-pads single-digit integers to width 2', () => {
    // Width 2 is the typical use case for HH/MM/SS string parts.
    expect(pad(7, 2)).toBe('07');
  });

  it('returns the number unchanged when it is already wider than width', () => {
    // pad uses padStart, which never truncates — wider inputs pass through.
    expect(pad(123, 2)).toBe('123');
  });

  it('returns "0" for zero with width 1', () => {
    expect(pad(0, 1)).toBe('0');
  });

  it('zero-pads to width 4 (used by some catalog identifiers)', () => {
    expect(pad(42, 4)).toBe('0042');
  });

  it('does not zero-pad negative numbers (sign character is treated as a digit)', () => {
    // padStart treats '-' as one character, so pad(-3, 2) is "-3" already at width 2.
    // Documented behaviour — sign handling is the caller's responsibility (see sdssName).
    expect(pad(-3, 2)).toBe('-3');
  });
});

describe('decomposeSexagesimal (rounding variant)', () => {
  it('decomposes 12.5 hours into [12, 30, 0]', () => {
    // 12.5 hours = 12h 30m 0s exactly. With subunitFactor=100 the third
    // component is in centiseconds: 0 means SS.ss = "00.00".
    const [h, m, sub] = decomposeSexagesimal(12.5, 100);
    expect(h).toBe(12);
    expect(m).toBe(30);
    expect(sub).toBe(0);
  });

  it('rounds floating-point dust upward when at a unit boundary', () => {
    // 23.9999999998° is effectively 24° but naive multiplication would leave
    // 23°59'59.99998... Rounding (rather than truncation) collapses this to
    // exactly 24°.
    const [d, m, sub] = decomposeSexagesimal(23.9999999998, 10);
    expect(d).toBe(24);
    expect(m).toBe(0);
    expect(sub).toBe(0);
  });

  it('returns subunits in [0, 60·subunitFactor) for any value', () => {
    // Sanity check on the integer-decomposition arithmetic: with
    // subunitFactor=10, the third component must always be < 600 (60×10).
    const [, , sub] = decomposeSexagesimal(45.7, 10);
    expect(sub).toBeGreaterThanOrEqual(0);
    expect(sub).toBeLessThan(600);
  });

  it('handles zero exactly', () => {
    expect(decomposeSexagesimal(0, 100)).toEqual([0, 0, 0]);
  });
});

describe('decomposeSexagesimalTrunc (truncation variant)', () => {
  it('truncates rather than rounds — 12.99999 hours stays in 12h', () => {
    // Truncation is required for catalog names (SDSS J...) so the published
    // designation never increments under measurement noise. 12.99999 hours
    // would naively round to 13h, but truncation keeps it in 12h59m59.x.
    const [h, m, _sub] = decomposeSexagesimalTrunc(12.99999, 100);
    expect(h).toBe(12);
    expect(m).toBe(59);
  });

  it('decomposes 12.5 hours into [12, 30, 0] (same as rounding variant for exact values)', () => {
    // Exact values produce identical results regardless of rounding mode.
    expect(decomposeSexagesimalTrunc(12.5, 100)).toEqual([12, 30, 0]);
  });

  it('returns zero on zero input', () => {
    expect(decomposeSexagesimalTrunc(0, 10)).toEqual([0, 0, 0]);
  });
});
