import type { SourceType } from '../data/SourceType';

/**
 * Joined per-source alias index entry.  Built lazily on first palette open
 * by `buildAliasIndex` from `pgc_aliases.json` ∩ each pgc-claiming source's
 * `hasDurableId`; `localIdx` is the record ordinal (a flat source's row index).
 *
 * Lives in `@types/engine/` (rather than alongside the fetcher) because it
 * is a post-processing shape derived from joining the fetcher's raw
 * `Map<bigint, readonly string[]>` against per-source clouds — no concern
 * of the fetcher itself.
 */
export type AliasIndexEntry = {
  pgc: number;
  names: readonly string[];
  source: SourceType;
  localIdx: number;
};
