import { describe, expect, it } from 'vitest';

import { formatBodyMass } from '../../../src/utils/format/formatBodyMass';

describe('formatBodyMass', () => {
  it('gives a planet in Earth masses to three significant figures', () => {
    expect(formatBodyMass(1.89813e27, false)).toBe('318 M⊕');
    expect(formatBodyMass(3.301e23, false)).toBe('0.0553 M⊕');
  });

  it('gives a moon in kilograms even when it outweighs Pluto', () => {
    expect(formatBodyMass(1.35e23, true)).toBe('1.35 × 10²³ kg');
  });

  it('gives a small Sun-orbiting body in kilograms, without padding zeros', () => {
    expect(formatBodyMass(9.38e20, false)).toBe('9.38 × 10²⁰ kg');
    expect(formatBodyMass(2.9e18, true)).toBe('2.9 × 10¹⁸ kg');
  });
});
