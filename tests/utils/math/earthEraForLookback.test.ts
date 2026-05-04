/**
 * Unit tests for `earthEraForLookback` — the Gyr → Earth-history string lookup.
 *
 * The function is a pure cascade of `if (gyrAgo < boundary) return string`.
 * We test:
 *   - Each band's representative midpoint maps to its expected string.
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

  it('returns the modern-era string for any sub-1-Myr lookback', () => {
    // 0.0005 Gyr = 500 kyr — still well inside the human-history era.
    expect(earthEraForLookback(0.0005)).toBe('essentially now (modern era)');
  });

  it('classifies the human-civilisation band [0.001, 0.0026) Gyr', () => {
    // Lookback inside the deep-prehistory window: e.g. 0.002 Gyr = 2 Myr.
    expect(earthEraForLookback(0.002)).toBe('during the rise of human civilisation');
  });

  it('classifies the pre-human band [0.0026, 0.066) Gyr', () => {
    // 0.05 Gyr = 50 Myr ago — well after the K-Pg extinction (66 Mya), so
    // mammals already exist but humans don't.
    expect(earthEraForLookback(0.05)).toBe('before the first humans');
  });

  it('classifies the pre-K-Pg-extinction band [0.066, 0.25) Gyr', () => {
    // 0.1 Gyr = 100 Myr ago — Cretaceous, dinosaurs still around.
    expect(earthEraForLookback(0.1)).toBe('before the dinosaurs went extinct');
  });

  it('classifies the Mesoproterozoic band [1.0, 1.6) Gyr', () => {
    // Direct exact-string match for one of the more memorable era labels.
    expect(earthEraForLookback(1.3)).toBe("during Earth's Mesoproterozoic");
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

  it('returns the pre-Earth-existed string for [4.5, 13.7) Gyr', () => {
    // 5 Gyr ago is older than Earth's formation (~4.5 Gyr), so the message
    // shifts from "Earth's primitive surface" to "Earth didn't exist".
    expect(earthEraForLookback(5)).toBe('before Earth even existed');
  });
});
