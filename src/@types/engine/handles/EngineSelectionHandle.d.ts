import type { SourceType } from '../../data/SourceType';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { PgcAliasMap } from '../../loading/PgcAliasMap';

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
  /**
   * Programmatically clear the current selection — galaxy AND POI in one
   * call.  "Close the card" semantic: anywhere a user dismisses the
   * InfoCard (Esc, the × button, URL drift back to empty hash), both
   * sides collapse together in a single render frame.
   *
   * Order is deterministic: galaxy selection clears first
   * (`onSelectChange` / `onFocusChange` fire), then POI selection
   * (`onPoiFocusChange` fires).  Idempotent: calling with neither
   * selected fires only the POI teardown's no-op callback chain
   * (preserves the pre-2026-05-19 `clearPoiFocus` semantic — no
   * presence gate).
   *
   * For code paths that need to clear ONLY the POI without disturbing
   * a pinned galaxy, drop down to the engine internals.  There's no
   * public narrow-clear method (no real consumer existed when this
   * was unified on 2026-05-19; revisit if a use case appears).
   */
  clear: () => void;
  /** Select (pin) the famous-atlas galaxy with the given id, then focus-tween. */
  selectFamous: (id: string) => void;
  /** Select a non-famous galaxy by (source, localIdx) and focus-tween. */
  selectByAlias: (target: {
    source: SourceType;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
  }) => void;
  /** Lazy-load the PGC → human-name alias map (1.7 MB JSON). */
  loadAliases: () => Promise<PgcAliasMap>;
};
