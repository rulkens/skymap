/**
 * galaxySbAmp — pins the physical surface-brightness amplitude formula.
 *
 * Coverage focus: the two dials that actually change the rendered
 * brightness (relative luminosity vs. projected area), plus the
 * diameter-fallback branch a real catalog with a missing measurement hits.
 */

import { describe, it, expect } from 'vitest';
import { galaxySbAmp } from '../../../src/utils/galaxy/galaxySbAmp';

describe('galaxySbAmp', () => {
  it('gives a brighter (more negative) absMag a larger amplitude at fixed diameter', () => {
    const dim = galaxySbAmp(-19, -20.5, 30);
    const bright = galaxySbAmp(-22, -20.5, 30);
    expect(bright).toBeGreaterThan(dim);
  });

  it('gives a smaller diameter a larger amplitude at fixed absMag', () => {
    const large = galaxySbAmp(-20.5, -20.5, 60);
    const small = galaxySbAmp(-20.5, -20.5, 15);
    expect(small).toBeGreaterThan(large);
  });

  it('treats a zero or negative diameter as the 30 kpc reference fallback', () => {
    const viaFallback = galaxySbAmp(-21, -20.5, 0);
    const viaExplicit30 = galaxySbAmp(-21, -20.5, 30);
    expect(viaFallback).toBe(viaExplicit30);

    const viaNegative = galaxySbAmp(-21, -20.5, -5);
    expect(viaNegative).toBe(viaExplicit30);
  });

  it('returns exactly 1.0 when absMag equals medianAbsMag and diameter is the 30 kpc reference', () => {
    // lumRel = 10^0 = 1, diamRatio = 1 → raw = 1.
    expect(galaxySbAmp(-20.5, -20.5, 30)).toBeCloseTo(1, 6);
  });
});
