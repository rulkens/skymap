/**
 * Joined per-source alias index entry.  Built lazily on first palette open
 * by `buildAliasIndex` from `pgc_aliases.json` ∩ each pgc-claiming source's
 * `hasDurableId`; (sourceLabel, pgc) is the entry's identity.
 *
 * Lives in `@types/engine/` (rather than alongside the fetcher) because it
 * is a post-processing shape derived from joining the fetcher's raw
 * `Map<bigint, readonly string[]>` against per-source clouds — no concern
 * of the fetcher itself.
 */
export type AliasIndexEntry = {
  pgc: number;
  names: readonly string[];
  /** Display label of the catalog holding the row ('GLADE'). */
  sourceLabel: string;
  /** The `#focus=` id a pick of this row navigates to, filled in by `buildAliasIndex`. */
  focusId: string;
};
