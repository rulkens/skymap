import { describe, it, expect } from 'vitest';
import { makeConeFilter } from '../../../../tools/utils/math/makeConeFilter';

/**
 * `makeConeFilter` builds an angular cone predicate by hoisting trig costs:
 * the factory precomputes the center unit vector and cos(radius) once,
 * and the returned predicate is a fast dot-product comparison per query.
 * This avoids per-call acos, sqrt, and spherical-distance trig, which
 * matters when the predicate runs millions of times over a catalog.
 */
describe('makeConeFilter', () => {
  it('accepts the cone center itself', () => {
    const isInCone = makeConeFilter(233.2, 32.3, 2.5);
    expect(isInCone(233.2, 32.3)).toBe(true);
  });

  it('accepts a point 1° off center in dec', () => {
    const isInCone = makeConeFilter(233.2, 32.3, 2.5);
    expect(isInCone(233.2, 33.3)).toBe(true);
  });

  it('rejects a point 3° off center', () => {
    const isInCone = makeConeFilter(233.2, 32.3, 2.5);
    expect(isInCone(233.2, 35.3)).toBe(false);
  });

  it('rejects the antipode', () => {
    const isInCone = makeConeFilter(0, 45, 30);
    expect(isInCone(180, -45)).toBe(false);
  });

  it('boundary: accepts 2.49° and rejects 2.51° (pure-dec offsets)', () => {
    const isInCone = makeConeFilter(180, 0, 2.5);
    // Pure dec offset: angular separation is exactly the dec delta
    expect(isInCone(180, 2.49)).toBe(true);
    expect(isInCone(180, 2.51)).toBe(false);
  });

  it('handles RA wrap-around: center RA 0.5°, point RA 359.5° at the same dec is inside', () => {
    const isInCone = makeConeFilter(0.5, 45, 2);
    // 0.5° to 359.5° is a 1° difference across the RA boundary
    expect(isInCone(359.5, 45)).toBe(true);
  });

  it('handles a polar center (dec +89°) without RA-compression artifacts', () => {
    const isInCone = makeConeFilter(0, 89, 2);
    // At high dec, RA-compression is extreme; the predicate should still work
    // Any point within 2° of (0, 89) should be accepted regardless of RA
    expect(isInCone(180, 87.5)).toBe(true);
    expect(isInCone(90, 88.5)).toBe(true);
  });
});
