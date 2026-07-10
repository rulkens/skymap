import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../src/utils/random/mulberry32';

describe('mulberry32', () => {
  it('returns floats in [0, 1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces a deterministic sequence for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces independent sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    // Highly unlikely two different seeds produce identical first-five values.
    const aValues = [a(), a(), a(), a(), a()];
    const bValues = [b(), b(), b(), b(), b()];
    expect(aValues).not.toEqual(bValues);
  });

  it('coerces non-integer seeds to a valid uint32 deterministically', () => {
    // 42.7 and 42 both pass through `>>> 0` to 42, so should produce identical
    // sequences. NaN coerces to 0.
    const a = mulberry32(42);
    const b = mulberry32(42.7);
    expect(a()).toBe(b());

    const c = mulberry32(0);
    const d = mulberry32(NaN);
    expect(c()).toBe(d());
  });
});
