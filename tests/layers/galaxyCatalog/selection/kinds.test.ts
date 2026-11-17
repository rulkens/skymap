import { describe, expect, it } from 'vitest';
import { galaxyCatalogSelectionKinds } from '../../../../src/layers/galaxyCatalog/selection/kinds';

describe('galaxyCatalog selection kind', () => {
  it('a famous galaxy may carry a label, a survey galaxy may not', () => {
    const [kind] = galaxyCatalogSelectionKinds;
    expect(kind!.mayHaveLabel({ type: 'galaxyCatalog', source: 'famousGalaxy', index: 0 })).toBe(
      true,
    );
    expect(kind!.mayHaveLabel({ type: 'galaxyCatalog', source: 'sdss', index: 0 })).toBe(false);
  });
});
