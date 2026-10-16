/**
 * sourceMaskOf — the galaxy catalog bitmask built from the value core hands the
 * `survey` entry. A pure projection of its argument: no state, no clock.
 */

import { describe, it, expect } from 'vitest';
import { sourceMaskOf } from '../../../../src/layers/galaxyCatalog/present/sourceMaskOf';
import { Source, GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { maskHas } from '../../../../src/utils/maskHas';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

function handed(
  overrides: Partial<Record<GalaxyCatalogId, number>>,
  rest = 0,
): Record<GalaxyCatalogId, number> {
  return Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => {
      const id = galaxyCatalogIdOf(s);
      return [id, overrides[id] ?? rest];
    }),
  ) as Record<GalaxyCatalogId, number>;
}

describe('sourceMaskOf', () => {
  it('sets a catalog bit exactly while its value is above 0', () => {
    const mask = sourceMaskOf(handed({ sdss: 0.25 }));
    expect(maskHas(mask, Source.SDSS)).toBe(true);
    for (const s of GALAXY_CATALOG_SOURCES) {
      if (s !== Source.SDSS) expect(maskHas(mask, s)).toBe(false);
    }
  });

  it('clears the bit at a value of exactly 0', () => {
    const mask = sourceMaskOf(handed({ sdss: 0 }, 1));
    expect(maskHas(mask, Source.SDSS)).toBe(false);
    expect(maskHas(mask, Source.TwoMRS)).toBe(true);
  });

  it('lights every galaxy-catalog bit when every value is above 0', () => {
    const mask = sourceMaskOf(handed({}, 1));
    for (const s of GALAXY_CATALOG_SOURCES) expect(maskHas(mask, s)).toBe(true);
  });
});
