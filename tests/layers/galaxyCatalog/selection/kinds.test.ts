import { describe, expect, it } from 'vitest';
import { galaxyCatalogSelectionKinds } from '../../../../src/layers/galaxyCatalog/selection/kinds';
import { Source } from '../../../../src/data/source';

describe('galaxyCatalog selection kind', () => {
  it('a famous galaxy may carry a label, a survey galaxy may not', () => {
    const [kind] = galaxyCatalogSelectionKinds;
    expect(
      kind!.mayHaveLabel({ type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 }),
    ).toBe(true);
    expect(kind!.mayHaveLabel({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 })).toBe(
      false,
    );
  });
});
