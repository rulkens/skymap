import { describe, expect, it } from 'vitest';
import { CATEGORY_DISPLAY_INFO } from '../../../src/data/structure/categoryDisplayInfo';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';

describe('CATEGORY_DISPLAY_INFO', () => {
  it('has a row per LabelCategory', () => {
    expect(Object.keys(CATEGORY_DISPLAY_INFO).sort()).toEqual([...LABEL_CATEGORIES].sort());
  });

  it("cluster renders 'Galaxy Cluster' / 'Cluster' / 'Clusters'", () => {
    const info = CATEGORY_DISPLAY_INFO['cluster'];
    expect(info.label).toBe('Galaxy Cluster');
    expect(info.shortLabel).toBe('Cluster');
    expect(info.plural).toBe('Clusters');
  });

  it("famousGalaxy renders 'Famous Galaxy' / 'Galaxy' / 'Famous Galaxies'", () => {
    const info = CATEGORY_DISPLAY_INFO['famousGalaxy'];
    expect(info.label).toBe('Famous Galaxy');
    expect(info.shortLabel).toBe('Galaxy');
    expect(info.plural).toBe('Famous Galaxies');
  });
});
