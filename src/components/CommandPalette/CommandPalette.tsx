/**
 * CommandPalette — Cmd+K (or Ctrl+K, or `/`) overlay for searching
 * across two parallel indexes:
 *
 *   1. The curated famous-galaxies atlas (`entries`, ~75 hand-picked).
 *   2. The PGC-keyed alias index (`aliasIndex`, ~48k GLADE+2MRS rows
 *      with NGC/IC/UGC/M/etc. cross-references from HyperLEDA).
 *
 * UX:
 *   - Triggered by a keyboard shortcut (handled in App.tsx).
 *   - Famous matches always rank above alias matches at equal score.
 *   - Alias matches are capped at 50 per query so a query that hits
 *     "MCG" (which matches thousands of rows) doesn't drown the famous
 *     hits or balloon the DOM.
 *   - Up/Down arrows move the highlight; Enter selects.
 *   - Esc closes without action.
 *   - Click outside the panel closes.
 *
 * A third, always-present row is the Milky Way — a first-class
 * FocusableTarget rather than a catalog object, so it carries no id or
 * alias tuple and renders a glyph instead of an atlas thumbnail.
 *
 * Selection: every row maps to a durable `#focus=<id>` string via
 * `utils/focusIdForRow` and is handed to the single `onSelect(focusId)`
 * callback.  The container fires `requestFocus(focusId)` — the one
 * command→ref bridge — so the palette never resolves a ref itself; famous,
 * alias, and Milky-Way picks all flow through the same path a deep-link does.
 *
 * This file is the shell only: layout + subcomponent wiring.  The transient
 * search state + keyboard nav live in `usePaletteSearch`; the ranking pipeline
 * in `utils/rankPaletteMatches`; the row-render table in `paletteRows`; and the
 * two views in `FeaturedGrid` / `ResultsList`.
 *
 * Why not a third-party command-palette library?  Same reasoning as
 * the original famous-only iteration: a thin slice of UI logic, no
 * value-add from cmdk/kbar, and the project bans component-level
 * barrel exports many of those libraries assume.
 */
import type { ReactNode } from 'react';
import { usePaletteSearch } from './usePaletteSearch';
import { FeaturedGrid } from './FeaturedGrid';
import { ResultsList } from './ResultsList';
import type { FamousMetaEntry } from '../../@types/loading/FamousMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import styles from './CommandPalette.module.css';

export type CommandPaletteProps = {
  /** All famous entries to search across.  Loaded from `famous_meta.json`. */
  entries: readonly FamousMetaEntry[];
  /**
   * The PGC alias index built by joining `pgc_aliases.json` against
   * the runtime GLADE+2MRS clouds.  Optional — the palette degrades
   * gracefully to famous-only when the array is undefined or empty
   * (e.g. on developer clones without the sidecar).
   */
  aliasIndex?: readonly AliasIndexEntry[];
  /** Whether the palette is currently shown. */
  open: boolean;
  /** Close handler — called on Esc, click-outside, or after a successful selection. */
  onClose: () => void;
  /**
   * Selection handler — receives the picked row's durable `#focus=<id>` string
   * (famous seed id, `pgc-<n>`, or the Milky-Way literal).  The container fires
   * `requestFocus(focusId)`; the palette resolves nothing itself.
   */
  onSelect: (focusId: string) => void;
};

export function CommandPalette({
  entries,
  aliasIndex,
  open,
  onClose,
  onSelect,
}: CommandPaletteProps): ReactNode {
  const {
    query,
    setQuery,
    activeIdx,
    setActiveIdx,
    matches,
    inputRef,
    onKeyDown,
    dispatchSelection,
  } = usePaletteSearch({ entries, aliasIndex, open, onClose, onSelect });

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search galaxies"
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search galaxies (M31, NGC 4565, Andromeda, …)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length === 0 && (
          <FeaturedGrid
            entries={entries}
            onSelect={(entry) => dispatchSelection({ kind: 'famous', entry, score: 0 })}
          />
        )}
        <ResultsList
          matches={matches}
          activeIdx={activeIdx}
          onActivate={setActiveIdx}
          onSelect={dispatchSelection}
        />
      </div>
    </div>
  );
}
