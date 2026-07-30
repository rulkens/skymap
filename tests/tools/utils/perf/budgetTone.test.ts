/**
 * budgetTone — one assertion per branch plus the exact `<` boundary values.
 * The boundaries are the whole point of a threshold function: 16.7 must be
 * yellow (not green) and 33.3 must be red (not yellow), because the comparisons
 * are strict `<`. A real bug flipping `<` to `<=` would only surface at exactly
 * those two values, so they are hand-verified here.
 */

import { describe, it, expect } from 'vitest';

import { budgetTone } from '../../../../tools/utils/perf/budgetTone';

describe('budgetTone', () => {
  it('is green under the 60fps frame budget', () => {
    expect(budgetTone(8.3)).toBe('green');
  });

  it('is yellow between the 60fps and 30fps budgets', () => {
    expect(budgetTone(21.4)).toBe('yellow');
  });

  it('is red beyond the 30fps budget', () => {
    expect(budgetTone(40)).toBe('red');
  });

  it('treats the 16.7 ms frame budget as already yellow (strict <)', () => {
    expect(budgetTone(16.7)).toBe('yellow');
  });

  it('treats the 33.3 ms half budget as already red (strict <)', () => {
    expect(budgetTone(33.3)).toBe('red');
  });
});
