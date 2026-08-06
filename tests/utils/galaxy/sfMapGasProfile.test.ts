/**
 * sfMapGasProfile — mirrors sfMapFluidStep.wesl's own `gasProfile` fn. The
 * one thing worth pinning here: the gasFloor=1 identity, since two other
 * modules (galaxySfMapFluidEvents.ts's rejection sampler, the WESL seed)
 * both depend on it collapsing to exactly 1.0 for their own byte-identical
 * invariants.
 */
import { describe, expect, it } from 'vitest';
import { sfMapGasProfile } from '../../../src/utils/galaxy/sfMapGasProfile';

describe('sfMapGasProfile', () => {
  it('is identically 1 everywhere when gasFloor is 1, regardless of r or scale length', () => {
    expect(sfMapGasProfile(0, 1, 4.5)).toBe(1);
    expect(sfMapGasProfile(5, 1, 4.5)).toBe(1);
    expect(sfMapGasProfile(1000, 1, 0.1)).toBe(1);
  });

  it('declines from 1 toward gasFloor as r grows, for a sub-1 gasFloor', () => {
    const near = sfMapGasProfile(0.01, 0.1, 4);
    const far = sfMapGasProfile(50, 0.1, 4);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeCloseTo(1, 2);
    expect(far).toBeCloseTo(0.1, 2);
  });
});
