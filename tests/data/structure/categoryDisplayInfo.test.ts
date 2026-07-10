import { describe, expect, it } from 'vitest';
import { CATEGORY_DISPLAY_INFO } from '../../../src/data/structure/categoryDisplayInfo';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';

describe('CATEGORY_DISPLAY_INFO', () => {
  it('has a row per LabelCategory', () => {
    expect(Object.keys(CATEGORY_DISPLAY_INFO).sort()).toEqual([...LABEL_CATEGORIES].sort());
  });
});
