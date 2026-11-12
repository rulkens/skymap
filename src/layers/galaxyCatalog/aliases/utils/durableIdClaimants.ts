import type { GalaxyCatalogSourceEntry } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyDurableIdClaim } from '../../../../@types/data/galaxyCatalog/GalaxyDurableIdClaim';
import type { GalaxyRecordSource } from '../../records/@types/GalaxyRecordSource';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';

/**
 * The record sources whose registry row claims `prefix` ids, lowest rank first:
 * the order a durable id is asked in and the palette joins names in.
 */
export function durableIdClaimants<T extends Pick<GalaxyRecordSource, 'source'>>(
  records: Iterable<T>,
  prefix: GalaxyDurableIdClaim['prefix'],
): T[] {
  const claimOf = (record: T) =>
    (GALAXY_CATALOG_SOURCE_RECORD[record.source] as GalaxyCatalogSourceEntry).durableId;
  return [...records]
    .filter((record) => claimOf(record)?.prefix === prefix)
    .sort((a, b) => claimOf(a)!.rank - claimOf(b)!.rank);
}
