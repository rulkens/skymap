/**
 * visibleCatalogsOf — the galaxy catalog id set built from the value core hands the
 * `survey` entry. A pure projection of its argument: no state, no clock.
 */

import { describe, it, expect } from 'vitest';
import { visibleCatalogsOf } from '../../../../../src/layers/galaxyCatalog/records/utils/visibleCatalogsOf';
import { Source } from '../../../../../src/data/source';
import { GALAXY_CATALOG_SOURCES } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import { makeGalaxyCatalogFade } from '../../../../fixtures/makeGalaxyCatalogFade';

describe('visibleCatalogsOf', () => {
  it('lists a catalog exactly while its value is above 0', () => {
    const visible = visibleCatalogsOf(makeGalaxyCatalogFade({ sdss: 0.25 }, 0));
    expect(visible.has(Source.SDSS)).toBe(true);
    for (const s of GALAXY_CATALOG_SOURCES) {
      if (s !== Source.SDSS) expect(visible.has(s)).toBe(false);
    }
  });

  it('drops the catalog at a value of exactly 0', () => {
    const visible = visibleCatalogsOf(makeGalaxyCatalogFade({ sdss: 0 }));
    expect(visible.has(Source.SDSS)).toBe(false);
    expect(visible.has(Source.TwoMRS)).toBe(true);
  });

  it('lists every galaxy catalog when every value is above 0', () => {
    const visible = visibleCatalogsOf(makeGalaxyCatalogFade());
    for (const s of GALAXY_CATALOG_SOURCES) expect(visible.has(s)).toBe(true);
  });
});
