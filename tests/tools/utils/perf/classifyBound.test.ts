/**
 * classifyBound — one case per branch of the exponent → label mapping.
 *
 * The thresholds are heuristic, so the test does not restate them as constants;
 * it pins the LABEL each representative exponent lands on, which is the decision
 * a real bug (a flipped comparison, a wrong boundary) would corrupt. The `NaN`
 * case guards the unmeasurable pass (a slot that read 0 ms everywhere).
 */

import { describe, it, expect } from 'vitest';

import { classifyBound } from '../../../../tools/utils/perf/classifyBound';

describe('classifyBound', () => {
  it('labels NaN as n/a', () => {
    expect(classifyBound(NaN)).toBe('n/a');
  });

  it('labels a ~linear exponent as fragment/fill-bound', () => {
    expect(classifyBound(1.0)).toBe('fragment/fill-bound');
  });

  it('labels a middling exponent as mixed', () => {
    expect(classifyBound(0.5)).toBe('mixed');
  });

  it('labels a flat exponent as vertex/CPU-bound', () => {
    expect(classifyBound(0.1)).toBe('vertex/CPU-bound');
  });
});
