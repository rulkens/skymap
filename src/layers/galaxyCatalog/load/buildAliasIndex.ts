/**
 * Pure alias-index builder: joins the PGC→names alias map against every
 * pgc-claiming source's `hasDurableId`, so the palette lists a name only when a
 * loaded source holds that galaxy. One entry per (source, pgc), sources by
 * claim rank, entries in ordinal order within a source (the row walk's order).
 */

import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';
import type { BuildAliasIndexInput } from '../../../@types/engine/BuildAliasIndexInput';
import { durableIdClaimants } from '../../../utils/galaxy/durableIdClaimants';

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { records, aliasMap } = input;
  const out: AliasIndexEntry[] = [];
  for (const record of durableIdClaimants(records, 'pgc')) {
    const entries: AliasIndexEntry[] = [];
    for (const [pgc, names] of aliasMap) {
      if (pgc === 0n || names.length === 0) continue; // no HyperLEDA match / key without values
      const id = `pgc-${pgc}`;
      if (!record.hasDurableId(id)) continue;
      const ordinal = record.resolveDurableId(id);
      if (typeof ordinal !== 'number') continue;
      entries.push({ pgc: Number(pgc), names, source: record.source, localIdx: ordinal });
    }
    entries.sort((a, b) => a.localIdx - b.localIdx);
    for (const entry of entries) out.push(entry);
  }
  return out;
}
