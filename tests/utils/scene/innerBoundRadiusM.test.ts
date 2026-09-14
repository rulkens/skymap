import { describe, expect, it } from 'vitest';

import { innerBoundRadiusM } from '../../../src/utils/scene/innerBoundRadiusM';

describe('innerBoundRadiusM', () => {
  it('adds the relief minimum to the datum', () => {
    // Asymmetric interval so reading the wrong tuple index fails here.
    expect(innerBoundRadiusM({ datumRadiusM: 100, reliefM: [-5, 10] })).toBe(95);
  });
});
