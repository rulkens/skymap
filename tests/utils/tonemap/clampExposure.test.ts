import { describe, it, expect } from 'vitest';
import { clampExposure } from '../../../src/utils/tonemap/clampExposure';

describe('clampExposure', () => {
  it('clampExposure clamps the upper bound to 16', () => {
    // The float-buffer guard: a runaway slider / devtools value must not
    // blow out the HDR uniform.
    expect(clampExposure(1e9)).toBe(16);
  });

  it('clampExposure clamps the lower bound to 0.05', () => {
    // The black-frame guard: a near-zero multiply collapses the HDR signal.
    expect(clampExposure(0)).toBe(0.05);
  });

  it('clampExposure passes an in-range value through', () => {
    expect(clampExposure(1.0)).toBe(1.0);
  });
});
