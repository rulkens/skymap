/**
 * Pure alias-index builder.  Walks each requested source's `objIDs`
 * array, looks up the PGC in the alias map, and emits one entry per
 * (source, localIdx) whose PGC has a non-empty alias list.
 *
 * Why pure / why a separate file?  `useAliasIndex` exists to drive a
 * React state update on first palette open, which is fundamentally
 * imperative.  But the logic *inside* the hook — "given these arrays
 * and this map, what entries should the index contain" — is pure
 * iteration with no React or DOM coupling.  Splitting it out lets us
 * test every branch (zero PGC, missing source, empty names) in node
 * without renderHook.  The hook's surrounding `useEffect` becomes
 * thin, unfailable glue.
 *
 * Two skip rules baked in:
 *   1. PGC === 0n means the cross-match never matched a HyperLEDA row;
 *      skip silently rather than emit a meaningless "PGC 0" entry.
 *   2. names.length === 0 means the alias loader had a key but no
 *      values (shouldn't happen with the current sidecar schema, but
 *      cheap defensive skip avoids an empty-string row in the palette).
 */

import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { BuildAliasIndexInput } from '../../@types/engine/BuildAliasIndexInput';

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { handle, aliasMap, sources } = input;
  const out: AliasIndexEntry[] = [];
  for (const source of sources) {
    const objIds = handle.sources.getCloudObjIds(source);
    if (!objIds) continue;
    for (let i = 0; i < objIds.length; i++) {
      const pgc = objIds[i]!;
      if (pgc === 0n) continue;
      const names = aliasMap.get(pgc);
      if (!names || names.length === 0) continue;
      out.push({ pgc, names, source, localIdx: i });
    }
  }
  return out;
}
