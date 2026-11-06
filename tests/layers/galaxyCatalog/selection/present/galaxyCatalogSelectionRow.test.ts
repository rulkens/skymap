import { describe, it, expect } from 'vitest';
import { galaxyCatalogSelectionRow } from '../../../../../src/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow';
import { GALAXY_CATALOG_SOURCES } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { Source } from '../../../../../src/data/source';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { galaxyRowRuntime } from '../../../../support/layerPickCodes';
import { fakePickCode } from '../../../../support/fakePickCode';

/** Every catalog loaded, under codes from 40 up: no code equals any `Source` value. */
function rowOverAllCatalogs() {
  const catalogs = new Map(GALAXY_CATALOG_SOURCES.map((s) => [s, makeGalaxyCatalog(16)] as const));
  return galaxyCatalogSelectionRow(galaxyRowRuntime({ catalogs }, fakePickCode()));
}

describe('galaxyCatalogSelectionRow pick codes', () => {
  it('encodePick then resolvePick round-trips under non-Source codes', () => {
    const row = rowOverAllCatalogs();
    for (const ref of [
      { type: 'galaxyCatalog', source: Source.SDSS, index: 12 },
      { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 3 },
    ] as const) {
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
      expect(row.resolvePick(pick)).toEqual(ref);
    }
  });

  it('pickSources are exactly the codes the stamps use', () => {
    const row = rowOverAllCatalogs();
    const stamped = GALAXY_CATALOG_SOURCES.map(
      (source) =>
        unpackPick(row.encodePick({ type: 'galaxyCatalog', source, index: 0 })!)!.sourceCode,
    );
    expect([...row.pickSources].sort()).toEqual([...stamped].sort());
  });
});
