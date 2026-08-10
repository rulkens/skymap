/**
 * Both the GPU pack and the CPU dust/bubble/ISM-map builders seed off this,
 * so a galaxy only reproduces while they agree. The `|| 1` is the load-bearing
 * part: `mulberry32` is degenerate at state 0, and the obvious "simplification"
 * to `seed ?? 1` passes every other test in the suite.
 */
import { describe, expect, it } from 'vitest';

import { normalizeGenerationSeed } from '../../../src/utils/galaxy/normalizeGenerationSeed';

describe('normalizeGenerationSeed', () => {
  it('maps an absent or zero seed to 1', () => {
    expect(normalizeGenerationSeed(undefined)).toBe(1);
    expect(normalizeGenerationSeed(0)).toBe(1);
  });

  it('truncates toward zero and keeps the sign', () => {
    expect(normalizeGenerationSeed(2.9)).toBe(2);
    expect(normalizeGenerationSeed(-3.9)).toBe(-3);
  });

  it('wraps past int32 rather than saturating', () => {
    // 2^31 as an int32 is -2^31.
    expect(normalizeGenerationSeed(2147483648)).toBe(-2147483648);
  });
});
