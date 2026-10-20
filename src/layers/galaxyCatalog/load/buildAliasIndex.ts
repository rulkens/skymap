/**
 * Pure alias-index builder: joins the PGC→names alias map against every
 * pgc-claiming source's `hasDurableId`, so the palette lists a name only when a
 * loaded source holds that galaxy. One entry per (source, pgc), sources by
 * claim rank, entries in alias-file order within a source; equal-score
 * palette ties may come in that order.
 */

import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';
import type { BuildAliasIndexInput } from '../../../@types/engine/BuildAliasIndexInput';
import { durableIdClaimants } from '../../../utils/galaxy/durableIdClaimants';

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { records, aliasMap } = input;
  const out: AliasIndexEntry[] = [];
  for (const record of durableIdClaimants(records, 'pgc')) {
    for (const [pgc, names] of aliasMap) {
      if (pgc === 0n || names.length === 0) continue; // no HyperLEDA match / key without values
      if (record.hasDurableId(`pgc-${pgc}`))
        out.push({ pgc: Number(pgc), names, source: record.source });
    }
  }
  return out;
}
