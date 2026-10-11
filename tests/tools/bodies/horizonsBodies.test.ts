import { describe, it, expect } from 'vitest';
import { FITTED_BODIES } from '../../../tools/bodies/fittedBodies';
import { HORIZONS_BODIES } from '../../../tools/bodies/horizonsBodies';

describe('Horizons tables', () => {
  it('gives every fitted id a position fetch row', () => {
    for (const f of FITTED_BODIES) {
      expect(HORIZONS_BODIES.find((b) => b.id === f.id)?.vectors).toBe('position');
    }
  });
});
