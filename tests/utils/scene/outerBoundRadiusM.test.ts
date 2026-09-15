import { describe, expect, it } from 'vitest';

import { outerBoundRadiusM } from '../../../src/utils/scene/outerBoundRadiusM';

describe('outerBoundRadiusM', () => {
  it('adds the relief maximum to the datum', () => {
    // Asymmetric interval so reading the wrong tuple index fails here.
    expect(outerBoundRadiusM({ datumRadiusM: 100, reliefM: [-5, 10] })).toBe(110);
  });
});
