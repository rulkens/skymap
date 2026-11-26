import { describe, expect, it } from 'vitest';
import { decimalsForStep } from '../../../src/utils/math/decimalsForStep';

describe('decimalsForStep', () => {
  it('counts the decimals a step is written with', () => {
    expect(decimalsForStep(0.05)).toBe(2);
    expect(decimalsForStep(0.25)).toBe(2);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(64)).toBe(0);
  });

  it('falls back to 0 for a step that is not a positive number', () => {
    expect(decimalsForStep(0)).toBe(0);
    expect(decimalsForStep(Number.NaN)).toBe(0);
  });
});
