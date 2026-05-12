import type { Source } from '../../data/sources';

/**
 * Joined per-cloud alias index entry.  Built lazily on first palette open
 * by `buildAliasIndex` from `pgc_aliases.json` ∩ per-source `objIds[]`.
 *
 * Lives in `@types/engine/` (rather than alongside the fetcher) because it
 * is a post-processing shape derived from joining the fetcher's raw
 * `Map<bigint, readonly string[]>` against per-source clouds — no concern
 * of the fetcher itself.
 */
export type AliasIndexEntry = {
  pgc: bigint;
  names: readonly string[];
  source: Source;
  localIdx: number;
};
