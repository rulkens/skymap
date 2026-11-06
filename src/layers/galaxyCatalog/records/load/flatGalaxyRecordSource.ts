/**
 * flatGalaxyRecordSource — the record contract over one whole in-memory
 * catalog: ordinal = row index, everything resident, every lookup a plain value.
 * Durable ids answer only for the row's own `durableId` claim, so a row without
 * one (the famous catalog's synthetic 0..N-1 `objIDs`) never shadows a pgc.
 */

import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogRegistryEntry } from '../../@types/GalaxyCatalogRegistryEntry';
import type { GalaxyCatalogSourceEntry } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyRecordSource } from '../@types/GalaxyRecordSource';

import { countEstimatedProvenance } from '../../provenance/utils/countEstimatedProvenance';
import { galaxyMagOffset } from '../../appearance/utils/galaxyMagOffset';
import { galaxyMedianAbsMag } from '../../../../utils/galaxy/galaxyMedianAbsMag';
import { buildObjIdLookup } from '../utils/buildObjIdLookup';
import { nearestRowByDirection } from '../utils/nearestRowByDirection';
import { extractGalaxyRow } from '../present/extractGalaxyRow';
import { famousGalaxyNamesFor } from '../../famousGalaxies/utils/famousGalaxyNamesFor';
import { Source } from '../../../../data/source';

export function flatGalaxyRecordSource(
  entry: GalaxyCatalogRegistryEntry,
  catalog: GalaxyCatalog,
): GalaxyRecordSource {
  const source = entry.code;
  const count = catalog.count;
  const claim = (entry as GalaxyCatalogSourceEntry).durableId;
  const prefix = claim === undefined ? null : `${claim.prefix}-`;
  // Built here, at catalog commit: the first ask comes from the frame planner's
  // alias-index rebuild, where a ~65 ms build would stall a frame.
  const lookup = prefix === null ? null : buildObjIdLookup(catalog.objIDs);
  if (source === Source.FamousGalaxy && famousGalaxyNamesFor(count) === null) {
    console.warn(
      `[famous] famous.bin has ${count} rows but the bundle names a different count: ` +
        'famous galaxies stay unnamed until bundle and data come from one build',
    );
  }

  function rowOfDurableId(id: string): number {
    if (prefix === null || lookup === null || !id.startsWith(prefix)) return -1;
    const digits = id.slice(prefix.length);
    if (!/^\d+$/.test(digits)) return -1;
    return lookup(BigInt(digits));
  }

  const resident = (n: number): number | null => (n >= 0 && n < count ? n : null);

  return {
    source,
    recordCount: count,
    stats: {
      magOffset: galaxyMagOffset(catalog),
      // Recomputed only for fixtures lacking it: the decoder always sets it.
      medianAbsMag: catalog.medianAbsMag ?? galaxyMedianAbsMag(catalog),
      provenance: countEstimatedProvenance(catalog),
    },
    ordinalOfPick: resident,
    pickOfOrdinal: resident,
    forEachResidentBlock: (visit) => visit(catalog, 0),
    hasDurableId: (id) => rowOfDurableId(id) >= 0,
    loadRow: (ordinal) => extractGalaxyRow(catalog, ordinal, source),
    resolveDurableId: (id) => resident(rowOfDurableId(id)),
    resolvePosition: (raDeg, decDeg, distMpc) =>
      resident(nearestRowByDirection(catalog.positions, count, raDeg, decDeg, distMpc)),
  };
}
