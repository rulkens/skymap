import { describe, it, expect } from 'vitest';

import { hyperbolicAnomalyFromMean } from '../../../src/utils/orbit/hyperbolicAnomalyFromMean';

describe('hyperbolicAnomalyFromMean', () => {
  it('inverts the forward equation', () => {
    // Round-trip against `M = e·sinh H − H` formed by hand, so a wrong formula
    // fails here; checking the solver's own residual would not.
    for (const h of [-3, -0.5, 0, 0.5, 3.4]) {
      for (const e of [1.5, 3.7, 6.28]) {
        const m = e * Math.sinh(h) - h;
        expect(hyperbolicAnomalyFromMean(m, e)).toBeCloseTo(h, 10);
      }
    }
  });
});
