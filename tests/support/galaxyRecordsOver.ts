import { GALAXY_CATALOG_SOURCE_RECORD } from '../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRecord';
import { flatGalaxyRecordSource } from '../../src/layers/galaxyCatalog/load/flatGalaxyRecordSource';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogSourceType';
import type { GalaxyRecordSource } from '../../src/@types/data/galaxyCatalog/GalaxyRecordSource';
import type { FamousGalaxyMetaEntry } from '../../src/@types/loading/FamousGalaxyMetaEntry';

/**
 * The flat record sources the galaxy slots would build over these catalogs, in
 * the map's order — the one-line fixture for a test that hands a
 * consumer a `catalogs` map.
 */
export function galaxyRecordsOver(
  catalogs: ReadonlyMap<number, GalaxyCatalog>,
  famousMeta: () => readonly FamousGalaxyMetaEntry[] = () => [],
): Map<GalaxyCatalogSourceType, GalaxyRecordSource> {
  const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>();
  for (const [source, catalog] of catalogs) {
    const entry = GALAXY_CATALOG_SOURCE_RECORD[source as GalaxyCatalogSourceType];
    records.set(entry.code, flatGalaxyRecordSource(entry, catalog, famousMeta));
  }
  return records;
}
