import { describe, it, expect } from 'vitest';
import { clampFilamentIntensity } from '../../src/utils/clampFilamentIntensity';

describe('clampFilamentIntensity', () => {
  it('clampFilamentIntensity bounds a negative value to 0', () => {
    // A negative intensity would drive a negative additive-blend alpha —
    // undefined output. The lower bound is the undefined-blend guard.
    expect(clampFilamentIntensity(-1)).toBe(0);
  });

  it('clampFilamentIntensity bounds a value above 1 to 1', () => {
    expect(clampFilamentIntensity(5)).toBe(1);
  });

  it('clampFilamentIntensity passes an in-range value through', () => {
    expect(clampFilamentIntensity(0.6)).toBe(0.6);
  });
});
