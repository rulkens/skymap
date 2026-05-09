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

  // Boundary semantics — same shape as galaxyTypeFromBminusJ:
  // both edges use '<', so 0.85 is 'green' and 1.0 is 'red'.
  it('exactly 0.85 is green (lower edge half-open right)', () => {
    expect(galaxyTypeFromJminusK(0.85).category).toBe('green');
  });
  it('exactly 1.0 is red (upper edge half-open right)', () => {
    expect(galaxyTypeFromJminusK(1.0).category).toBe('red');
  });

  // Diagnostic outcome: like its B−J sibling, this classifier has no
  // NaN guard — the dispatcher handles missing photometry.  Pin
  // current behaviour so a future refactor can't add an accidental
  // NaN-safe branch here without flipping this test.
  it('NaN input falls through to the final branch (red) — guard lives in dispatcher', () => {
    expect(galaxyTypeFromJminusK(NaN).category).toBe('red');
  });
});
