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

import type { EngineHandle } from '../@types';
import type { Source } from '../data/sources';

/**
 * One row of the runtime alias-search index.
 *
 * Built by joining the PGC→names Map (loaded via the pgcAlias slot's
 * fetcher) against the GLADE and 2MRS PointClouds. The palette filters
 * across these entries; selecting one calls back through
 * `engine.selection.selectByAlias` which uses `(source, localIdx)` to compute the
 * global index + camera focus.
 *
 * `pgc` is retained for debugging/tracing (logs read better with PGC
 * numbers attached) but the runtime selection path doesn't need it —
 * `localIdx` already pins the row inside its source cloud.
 *
 * Lives in this file (rather than the fetcher) because it is a
 * post-processing shape derived from joining the fetcher's raw `Map<bigint,
 * readonly string[]>` against per-source clouds — no concern of the
 * fetcher itself.  The pre-rework loader colocated it with the fetch
 * function for historical convenience; the asset-loading rework split
 * the concerns and this type stays with its actual builder.
 */
export type AliasIndexEntry = {
  pgc: bigint;
  names: readonly string[];
  source: Source;
  localIdx: number;
};

export type BuildAliasIndexInput = {
  handle: EngineHandle;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly Source[];
};

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
