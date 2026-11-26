import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../src/utils/random/mulberry32';

describe('mulberry32', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
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
