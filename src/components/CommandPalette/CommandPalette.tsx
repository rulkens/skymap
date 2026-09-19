/**
 * CommandPalette — Cmd+K (or Ctrl+K, or `/`) overlay for searching
 * across three parallel indexes:
 *
 *   1. The curated famous-galaxies atlas (`entries`, ~75 hand-picked).
 *   2. The PGC-keyed alias index (`aliasIndex`, ~48k GLADE+2MRS rows
 *      with NGC/IC/UGC/M/etc. cross-references from HyperLEDA).
 *   3. The large-scale structure index (`structures`, ~370 clusters /
 *      superclusters / voids / groups, by name + Abell number).
 *
 * UX:
 *   - Triggered by Cmd+K / Ctrl+K / `/`, routed through `watchKeyboardEventsSaga`
 *     via the `KEYBOARD_SHORTCUTS` map.
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
 * Selection: every row maps to a `PaletteAction` via `utils/actionForRow`; a
 * featured-grid card already carries its own.  Either way it reaches the
 * single `onSelect(action)` callback, and the container dispatches on
 * `action.kind` — for `focus`, `requestFocus(focusId)`, the one command→ref
 * bridge — so the palette never resolves a ref itself.
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
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { usePaletteSearch } from './usePaletteSearch';
import FeaturedGrid from './FeaturedGrid';
import PaletteTabs from './PaletteTabs';
import ResultsList from './ResultsList';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import type { PaletteTab } from '../../@types/palette/PaletteTab';
import type { PaletteTabId } from '../../@types/palette/PaletteTabId';
import styles from './CommandPalette.module.css';

export type CommandPaletteProps = {
  /** All famous entries to search across.  Loaded from `famous_galaxies_meta.json`. */
  readonly entries: readonly FamousGalaxyMetaEntry[];
  /**
   * The PGC alias index built by joining `pgc_aliases.json` against
   * the runtime GLADE+2MRS clouds.  Optional — the palette degrades
   * gracefully to famous-only when the array is undefined or empty
   * (e.g. on developer clones without the sidecar).
   */
  readonly aliasIndex?: readonly AliasIndexEntry[];
  /**
   * The large-scale structure index (clusters / superclusters / voids / groups)
   * snapshotted from the engine's loaded structures on palette open.  Optional —
   * the palette degrades to galaxy-only search when undefined or empty (e.g.
   * before the structure catalog has loaded, or with every structure category
   * hidden).
   */
  readonly structures?: readonly StructureSearchEntry[];
  /** The browse tabs shown in the empty-query state — the container passes `FEATURED_TABS`. */
  readonly tabs: readonly PaletteTab[];
  /** The stored active tab id (`ui.paletteTab`); falls back to the first shown tab if absent. */
  readonly tab: PaletteTabId;
  /** Fired when the user picks a tab. */
  readonly onTabChange: (id: PaletteTabId) => void;
  /** Whether the palette is currently shown. */
  readonly open: boolean;
  /** Close handler — called on Esc, click-outside, or after a successful selection. */
  readonly onClose: () => void;
  /**
   * Selection handler — receives the picked row's `PaletteAction`.  The
   * container dispatches on `action.kind`; the palette resolves nothing itself.
   */
  readonly onSelect: (action: PaletteAction) => void;
};

function CommandPalette({
  entries,
  aliasIndex,
  structures,
  tabs,
  tab,
  onTabChange,
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
    dispatchAction,
  } = usePaletteSearch({ entries, aliasIndex, structures, open, onClose, onSelect });
  const gridRef = useRef<HTMLUListElement | null>(null);

  if (!open) return null;

  // Hide any tab with no cards (PR1 has none; PR3's Tours tab will), and
  // fall back to the first shown tab when the stored one no longer qualifies.
  const shownTabs = tabs.filter((t) => t.cards.length > 0);
  const activeTab = shownTabs.find((t) => t.id === tab) ?? shownTabs[0];

  return (
    <div className={styles.root} onClick={onClose} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search galaxies, stars, planets, and clusters"
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search galaxies, stars, planets & clusters…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length === 0 ? (
          <>
            {shownTabs.length > 0 && (
              <PaletteTabs tabs={shownTabs} active={activeTab?.id ?? tab} onChange={onTabChange} />
            )}
            {activeTab && (
              <FeaturedGrid
                cards={activeTab.cards}
                famous={entries}
                activeIdx={-1}
                gridRef={gridRef}
                label={activeTab.label}
                onSelect={dispatchAction}
              />
            )}
          </>
        ) : (
          <ResultsList
            matches={matches}
            activeIdx={activeIdx}
            onActivate={setActiveIdx}
            onSelect={dispatchSelection}
          />
        )}
      </div>
    </div>
  );
}

export default CommandPalette;
