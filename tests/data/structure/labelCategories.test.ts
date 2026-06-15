import { describe, expect, it } from 'vitest';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import { STRUCTURE_CATEGORIES } from '../../../src/data/structure/structureCategories';

describe('LABEL_CATEGORIES', () => {
  it('contains famousGalaxy, milkyWay, and the four structure categories', () => {
    expect([...LABEL_CATEGORIES].sort()).toEqual([
      'cluster',
      'famousGalaxy',
      'group',
      'milkyWay',
      'supercluster',
      'void',
    ]);
  });

  it('is a superset of STRUCTURE_CATEGORIES', () => {
    for (const cat of STRUCTURE_CATEGORIES) {
      expect(LABEL_CATEGORIES).toContain(cat);
    }
  });

  it('excludes bulk galaxy catalogs', () => {
    expect(LABEL_CATEGORIES).not.toContain('sdss');
    expect(LABEL_CATEGORIES).not.toContain('glade');
  });
});
