import { describe, it, expect } from 'vitest';
import { galaxyTypeFromJminusK } from '../../../src/utils/math/galaxyTypeFromJminusK';

describe('galaxyTypeFromJminusK', () => {
  it('J−K < 0.85 is blue', () => {
    expect(galaxyTypeFromJminusK(0.75).category).toBe('blue');
  });
  it('0.85 ≤ J−K < 1.0 is green', () => {
    expect(galaxyTypeFromJminusK(0.92).category).toBe('green');
  });
  it('J−K ≥ 1.0 is red', () => {
    expect(galaxyTypeFromJminusK(1.05).category).toBe('red');
  });
});
