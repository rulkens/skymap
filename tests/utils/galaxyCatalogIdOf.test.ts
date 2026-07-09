/**
 * galaxyCatalogIdOf maps a numeric galaxy-catalog `Source` code to its string
 * `GalaxyCatalogId`. The expectations are derived from `SOURCE_REGISTRY` rather
 * than hardcoded, so the test stays registry-truthful: it asserts the helper
 * returns exactly the registry's `.id` for every galaxy-catalog source.
 */

import { describe, it, expect } from 'vitest';
import { galaxyCatalogIdOf } from '../../src/utils/galaxyCatalogIdOf';
import { Source, GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../src/data/sources';

describe('galaxyCatalogIdOf', () => {
  it('maps each galaxy-catalog source to its registry id', () => {
    for (const source of GALAXY_CATALOG_SOURCES) {
      expect(galaxyCatalogIdOf(source)).toBe(SOURCE_REGISTRY[source].id);
    }
  });

  it('resolves the known galaxy-catalog ids', () => {
    expect(galaxyCatalogIdOf(Source.SDSS)).toBe('sdss');
    expect(galaxyCatalogIdOf(Source.TwoMRS)).toBe('2mrs');
    expect(galaxyCatalogIdOf(Source.Glade)).toBe('glade');
    expect(galaxyCatalogIdOf(Source.FamousGalaxy)).toBe('famousGalaxy');
    expect(galaxyCatalogIdOf(Source.Milliquas)).toBe('milliquas');
    expect(galaxyCatalogIdOf(Source.Synthetic)).toBe('synthetic');
    expect(galaxyCatalogIdOf(Source.DesiDeep)).toBe('desiDeep');
    expect(galaxyCatalogIdOf(Source.DesiWedge)).toBe('desiWedge');
    expect(galaxyCatalogIdOf(Source.DesiSgw)).toBe('desiSgw');
    expect(galaxyCatalogIdOf(Source.DesiSgwShape)).toBe('desiSgwShape');
  });
});
