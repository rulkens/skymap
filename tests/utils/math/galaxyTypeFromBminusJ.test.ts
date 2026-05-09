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

  // Boundary semantics: the source uses '<' for both edges, so the lower
  // edge (1.5) lands in 'green' and the upper edge (2.5) lands in 'red'.
  // Pinning the exact boundary value catches a comparison-operator flip
  // refactor (e.g. '<' → '<=') that the three-sample happy-path tests
  // would silently survive.
  it('exactly 1.5 is green (lower edge half-open right)', () => {
    expect(galaxyTypeFromBminusJ(1.5).category).toBe('green');
  });
  it('exactly 2.5 is red (upper edge half-open right)', () => {
    expect(galaxyTypeFromBminusJ(2.5).category).toBe('red');
  });

  // Diagnostic outcome: this individual classifier has *no* NaN guard.
  // `NaN < 1.5` and `NaN < 2.5` are both false, so it falls through to
  // the 'red' branch.  The NaN-handling responsibility lives in the
  // `galaxyType` dispatcher (via `Number.isFinite`), not here — and
  // pinning that fact here catches a future refactor that adds an
  // accidental NaN-safe `if` at this layer.
  it('NaN input falls through to the final branch (red) — guard lives in dispatcher', () => {
    expect(galaxyTypeFromBminusJ(NaN).category).toBe('red');
  });
});
