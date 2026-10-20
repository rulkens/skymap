import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyDurableIdClaim } from '../../@types/data/galaxyCatalog/GalaxyDurableIdClaim';
import type { GalaxyRecordSource } from '../../@types/data/galaxyCatalog/GalaxyRecordSource';
import { SOURCE_REGISTRY } from '../../data/sources';

/**
 * The record sources whose registry row claims `prefix` ids, lowest rank first:
 * the order a durable id is asked in and the palette joins names in.
 */
export function durableIdClaimants(
  records: Iterable<GalaxyRecordSource>,
  prefix: GalaxyDurableIdClaim['prefix'],
): GalaxyRecordSource[] {
  const claimOf = (record: GalaxyRecordSource) =>
    (SOURCE_REGISTRY[record.source] as GalaxyCatalogSourceEntry).durableId;
  return [...records]
    .filter((record) => claimOf(record)?.prefix === prefix)
    .sort((a, b) => claimOf(a)!.rank - claimOf(b)!.rank);
}
