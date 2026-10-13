import { describe, it, expect } from 'vitest';

import { mayHaveLabel } from '../../../src/utils/selection/mayHaveLabel';
import { Source } from '../../../src/data/source';

describe('mayHaveLabel', () => {
  it('is true for a famous galaxy and false for a survey galaxy', () => {
    expect(mayHaveLabel({ type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 })).toBe(
      true,
    );
    expect(mayHaveLabel({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 })).toBe(false);
  });
  it('is true for a seeded star and false for a Gaia survey star', () => {
    expect(mayHaveLabel({ type: 'starCatalog', source: Source.FamousStar, index: 0 })).toBe(true);
    expect(mayHaveLabel({ type: 'starCatalog', source: Source.GaiaStars, index: 0 })).toBe(false);
  });
  it('is true for a structure and false for null', () => {
    expect(mayHaveLabel({ type: 'structure', id: 'cluster-virgo' })).toBe(true);
    expect(mayHaveLabel(null)).toBe(false);
  });
});
