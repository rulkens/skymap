import { GALAXY_CATALOG_SOURCE_RECORD } from '../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRecord';
import { flatGalaxyRecordSource } from '../../src/layers/galaxyCatalog/records/load/flatGalaxyRecordSource';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { GalaxyRecordSource } from '../../src/layers/galaxyCatalog/records/@types/GalaxyRecordSource';

/**
 * The flat record sources the galaxy slots would build over these catalogs, in
 * the map's order — the one-line fixture for a test that hands a
 * consumer a `catalogs` map.
 */
export function galaxyRecordsOver(
  catalogs: ReadonlyMap<GalaxyCatalogId, GalaxyCatalog>,
): Map<GalaxyCatalogId, GalaxyRecordSource> {
  const records = new Map<GalaxyCatalogId, GalaxyRecordSource>();
  for (const [source, catalog] of catalogs) {
    const entry = GALAXY_CATALOG_SOURCE_RECORD[source as GalaxyCatalogId];
    records.set(entry.id, flatGalaxyRecordSource(entry, catalog));
  }
  return records;
}
