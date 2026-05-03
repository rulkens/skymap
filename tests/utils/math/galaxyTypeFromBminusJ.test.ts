import { describe, it, expect } from 'vitest';
import { galaxyTypeFromBminusJ } from '../../../src/utils/math/galaxyTypeFromBminusJ';

describe('galaxyTypeFromBminusJ', () => {
  it('B−J < 1.5 is blue (star-forming)', () => {
    expect(galaxyTypeFromBminusJ(0.8).category).toBe('blue');
  });
  it('1.5 ≤ B−J < 2.5 is intermediate (green valley)', () => {
    expect(galaxyTypeFromBminusJ(2.0).category).toBe('green');
  });
  it('B−J ≥ 2.5 is red (quiescent)', () => {
    expect(galaxyTypeFromBminusJ(3.0).category).toBe('red');
  });
});
