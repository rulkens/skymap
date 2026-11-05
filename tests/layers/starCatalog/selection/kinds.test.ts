import { describe, expect, it } from 'vitest';
import { starCatalogSelectionKinds } from '../../../../src/layers/starCatalog/selection/kinds';
import { Source } from '../../../../src/data/source';

describe('starCatalog selection kind', () => {
  it('a seeded star may carry a label, a Gaia star may not', () => {
    const [kind] = starCatalogSelectionKinds;
    expect(kind!.mayHaveLabel({ type: 'starCatalog', source: Source.FamousStar, index: 0 })).toBe(
      true,
    );
    expect(kind!.mayHaveLabel({ type: 'starCatalog', source: Source.GaiaStars, index: 0 })).toBe(
      false,
    );
  });
});
