/**
 * Pure alias-index builder: joins each requested source's `objIDs` against the
 * PGC→names alias map. Kept free of React/engine-handle coupling so every
 * branch (zero PGC, missing source, empty names) is testable in node.
 */

import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';
import type { BuildAliasIndexInput } from '../../../@types/engine/BuildAliasIndexInput';

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { catalogs, aliasMap, sources } = input;
  const out: AliasIndexEntry[] = [];
  for (const source of sources) {
    const objIds = catalogs.get(source)?.objIDs;
    if (!objIds) continue;
    for (let i = 0; i < objIds.length; i++) {
      const pgc = objIds[i]!;
      if (pgc === 0n) continue; // no HyperLEDA cross-match
      const names = aliasMap.get(pgc);
      if (!names || names.length === 0) continue; // key present, no values
      out.push({ pgc: Number(pgc), names, source, localIdx: i });
    }
  }
  return out;
}
