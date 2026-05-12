import type { Source } from '../data/sources';
import type { FamousMetaEntry } from './loading/FamousMetaEntry';
import type { FamousXrefMap } from './loading/FamousXrefMap';
import type { PgcAliasMap } from './loading/PgcAliasMap';

/**
 * EngineSelectionHandle — selection bookkeeping + the data its consumers need.
 *
 * `clear` revokes the current pin.  `selectFamous` / `selectByAlias` are the
 * two entry points the command palette uses to land a hit.  `loadAliases`
 * is the lazy-fetch helper that powers alias search — it lives here because
 * `selectByAlias` is its only consumer; nesting them together puts the data
 * loader next to its data consumer.
 */
export type EngineSelectionHandle = {
  /** Programmatically clear the current selection. */
  clear: () => void;
  /** Select (pin) the famous-atlas galaxy with the given id, then focus-tween. */
  selectFamous: (id: string) => void;
  /** Select a non-famous galaxy by (source, localIdx) and focus-tween. */
  selectByAlias: (target: {
    source: Source;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
    famousXrefs?: FamousXrefMap;
  }) => void;
  /** Lazy-load the PGC → human-name alias map (1.7 MB JSON). */
  loadAliases: () => Promise<PgcAliasMap>;
};
