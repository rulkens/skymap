/**
 * flatGalaxyRecordSource — the record contract over one in-memory catalog.
 * Its stats must equal what the bake computed per tier file before the move,
 * and its durable ids answer only the row's own claim: the famous catalog's
 * synthetic objIDs 0..N-1 would otherwise answer `pgc-3`.
 */

import { describe, it, expect, vi } from 'vitest';

import { flatGalaxyRecordSource } from '../../../../../src/layers/galaxyCatalog/records/load/flatGalaxyRecordSource';
import { Source } from '../../../../../src/data/source';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRecord';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { FAMOUS_GALAXY_NAMES } from '../../../../../src/layers/galaxyCatalog/famousGalaxies/data/famousGalaxyNames.generated';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyRow } from '../../../../../src/@types/engine/GalaxyRow';
import type { GalaxyCatalogSourceType } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogSourceType';

const sourceOver = (source: GalaxyCatalogSourceType, catalog: GalaxyCatalog) =>
  flatGalaxyRecordSource(GALAXY_CATALOG_SOURCE_RECORD[source], catalog);

describe('flatGalaxyRecordSource', () => {
  it('stats equal the per-tier values', () => {
    const catalog = makeGalaxyCatalog(3, {
      magG: new Float32Array([16, 17, NaN]),
      medianAbsMag: -21,
      orientationIsFallback: new Uint8Array([0, 1, 0]),
      diameterIsFallback: new Uint8Array([1, 0, 1]),
    });
    // SDSS target mean 18 minus the finite mean 16.5.
    expect(sourceOver(Source.Glade, catalog).stats).toEqual({
      magOffset: 1.5,
      medianAbsMag: -21,
      provenance: { total: 3, estimated: { orientation: 1, size: 2 } },
    });
  });

  it("resolveDurableId answers only its row's claim", () => {
    const glade = sourceOver(
      Source.Glade,
      makeGalaxyCatalog(3, { objIDs: new BigUint64Array([7n, 2789n, 2789n]) }),
    );
    expect(glade.resolveDurableId('pgc-2789')).toBe(1);
    expect(glade.resolveDurableId('pgc-8')).toBeNull();
    expect(glade.resolveDurableId('sdss-2789')).toBeNull();
    expect(glade.resolveDurableId('pgc-x')).toBeNull();
    const famous = sourceOver(
      Source.FamousGalaxy,
      makeGalaxyCatalog(4, { objIDs: new BigUint64Array([0n, 1n, 2n, 3n]) }),
    );
    expect(famous.resolveDurableId('pgc-3')).toBeNull();
  });

  it('names no famous row, and warns once, when famous.bin is another generation than the bundle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const drifted = sourceOver(
      Source.FamousGalaxy,
      makeGalaxyCatalog(FAMOUS_GALAXY_NAMES.length + 1),
    );
    expect((drifted.loadRow(0) as GalaxyRow | null)?.famous).toBeUndefined();
    expect((drifted.loadRow(1) as GalaxyRow | null)?.famous).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    const matched = sourceOver(Source.FamousGalaxy, makeGalaxyCatalog(FAMOUS_GALAXY_NAMES.length));
    expect((matched.loadRow(1) as GalaxyRow | null)?.famous).toEqual(FAMOUS_GALAXY_NAMES[1]);
  });

  it('resolvePosition with a distance finds the record and without one keeps the 30 arcsec search', () => {
    // Two galaxies on one line of sight (RA 0, Dec 0), 10 and 20 Mpc out.
    const flat = sourceOver(
      Source.Glade,
      makeGalaxyCatalog(2, { positions: new Float32Array([10, 0, 0, 20, 0, 0]) }),
    );
    expect(flat.resolvePosition(0, 0, 20)).toBe(1);
    expect(flat.resolvePosition(0, 0, 10.02)).toBe(0);
    expect(flat.resolvePosition(0, 0, 15)).toBeNull();
    expect(flat.resolvePosition(0, 0, null)).toBe(0);
    // 0.01° = 36″: outside the envelope either way.
    expect(flat.resolvePosition(0.01, 0, null)).toBeNull();
  });
});
