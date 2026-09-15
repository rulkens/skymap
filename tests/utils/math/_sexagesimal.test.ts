/**
 * Unit tests for the internal sexagesimal helpers.
 *
 * These functions aren't part of the public math barrel (the leading underscore
 * makes that clear), but they're imported by `formatRaSexagesimal`,
 * `formatDecSexagesimal`, `sdssName`, and `iauName`.  Since those public
 * formatters delegate the heavy lifting here, a regression in
 * `decomposeSexagesimal*` would cascade through every coordinate string the
 * UI displays — worth pinning the contract directly.
 */

import { describe, it, expect } from 'vitest';
import {
  decomposeSexagesimal,
  decomposeSexagesimalTrunc,
} from '../../../src/utils/math/_sexagesimal';

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
});
