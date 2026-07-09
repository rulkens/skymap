import { describe, it, expect } from 'vitest';
import { makeRaDecZBoxFilter } from '../../../../tools/utils/math/makeRaDecZBoxFilter';

/**
 * `makeRaDecZBoxFilter` builds a bounded RA × Dec × redshift box predicate: a
 * row is inside when its RA, Dec, AND redshift each lie within their inclusive
 * bounds. Pure interval comparisons, no trig, no RA wraparound (the spans it's
 * used for don't cross the 0°/360° seam).
 *
 * Parameters mirror the Sloan Great Wall box patch: RA 137°–214°, Dec −5°..+8°,
 * z 0.055–0.095.
 */
describe('makeRaDecZBoxFilter', () => {
  const isInBox = makeRaDecZBoxFilter(137, 214, -5, 8, 0.055, 0.095);

  it('accepts a point clearly inside the box', () => {
    expect(isInBox(175, 1.5, 0.075)).toBe(true);
  });

  it('accepts the box corners (all six inclusive edges)', () => {
    expect(isInBox(137, -5, 0.055)).toBe(true);
    expect(isInBox(214, 8, 0.095)).toBe(true);
  });

  it('rejects points past the lower and upper RA edges', () => {
    expect(isInBox(137, 1.5, 0.075)).toBe(true);
    expect(isInBox(136.99, 1.5, 0.075)).toBe(false);
    expect(isInBox(214, 1.5, 0.075)).toBe(true);
    expect(isInBox(214.01, 1.5, 0.075)).toBe(false);
  });

  it('rejects points past the lower and upper Dec edges', () => {
    expect(isInBox(175, -5, 0.075)).toBe(true);
    expect(isInBox(175, -5.01, 0.075)).toBe(false);
    expect(isInBox(175, 8, 0.075)).toBe(true);
    expect(isInBox(175, 8.01, 0.075)).toBe(false);
  });

  it('rejects points past the lower and upper redshift edges', () => {
    expect(isInBox(175, 1.5, 0.055)).toBe(true);
    expect(isInBox(175, 1.5, 0.0549)).toBe(false);
    expect(isInBox(175, 1.5, 0.095)).toBe(true);
    expect(isInBox(175, 1.5, 0.0951)).toBe(false);
  });

  it('rejects a point inside the sky window but in front of / behind the redshift shell', () => {
    // Foreground (nearer than the wall) and background (past it) both drop —
    // the depth bound is what makes this a box and not an infinite drill.
    expect(isInBox(175, 1.5, 0.02)).toBe(false);
    expect(isInBox(175, 1.5, 0.3)).toBe(false);
  });

  it('rejects a point at the right redshift but outside the sky window', () => {
    expect(isInBox(100, 1.5, 0.075)).toBe(false);
    expect(isInBox(175, 40, 0.075)).toBe(false);
  });
});
