/**
 * Pure alias-index builder: joins the PGC→names alias map against every
 * pgc-claiming source's `hasDurableId`, so the palette lists a name only when a
 * loaded source holds that galaxy. One entry per (source, pgc), each carrying its
 * `#focus=` id, sources by claim rank, entries in alias-file order within a source; equal-score
 * palette ties may come in that order.
 */

import type { AliasIndexEntry } from '../../../../@types/engine/AliasIndexEntry';
import type { BuildAliasIndexInput } from '../@types/BuildAliasIndexInput';
import { encodeGalaxyId } from '../../selection/utils/encodeGalaxyId';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';
import { durableIdClaimants } from '../utils/durableIdClaimants';

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { records, aliasMap } = input;
  const out: AliasIndexEntry[] = [];
  for (const record of durableIdClaimants(records, 'pgc')) {
    for (const [pgc, names] of aliasMap) {
      if (pgc === 0n || names.length === 0) continue; // no HyperLEDA match / key without values
      if (!record.hasDurableId(`pgc-${pgc}`)) continue;
      // ra/dec/distMpc are unused: a PGC objId (> 0) takes the catalog-id rung
      // before the pos@ rung.
      const focusId = encodeGalaxyId({
        source: record.source,
        famousId: null,
        objId: pgc,
        ra: 0,
        dec: 0,
        distMpc: 0,
      });
      out.push({
        pgc: Number(pgc),
        names,
        sourceLabel: GALAXY_CATALOG_SOURCE_RECORD[record.source].label,
        focusId,
      });
    }
  }
  return out;
}
