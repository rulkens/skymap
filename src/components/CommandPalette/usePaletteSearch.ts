/**
 * usePaletteSearch — owns the command palette's transient search state and
 * keyboard navigation: the query string, the active-row/active-card
 * highlights, the input + grid refs, the ranked `matches` memo, the
 * open/query/tab reset effects, and the select + key-down handlers.
 *
 * Pulled out of the `CommandPalette` shell so the component is reduced to
 * layout + subcomponent wiring; everything stateful lives here.  On select it
 * maps the chosen row to its `PaletteAction` (`actionForRow`) and hands that
 * to the single `onSelect(action)` callback — the shell's parent dispatches
 * on `action.kind`.  A grid card already carries its own `PaletteAction`, so
 * `dispatchAction` skips the row-mapping step but runs the same close.
 *
 * Two keyboard navigators share one `onKeyDown`, picked by the same
 * empty-query test that picks the view (grid vs results list): the grid
 * navigator moves `activeCard` via `gridIndexStep`, measuring the rendered
 * grid's column count at key time so CSS stays its only home; the list
 * navigator is the original wrap-and-select behaviour, unchanged.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject, KeyboardEvent } from 'react';
import { rankPaletteMatches } from './utils/rankPaletteMatches';
import { actionForRow } from './utils/actionForRow';
import { wrapIndex } from './utils/wrapIndex';
import { gridIndexStep } from './utils/gridIndexStep';
import { measureGridColumns } from './utils/measureGridColumns';
import type { GridKey } from './utils/gridIndexStep';
import type { ScoredRow } from './paletteRowModel';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import type { PaletteCard } from '../../@types/palette/PaletteCard';

const GRID_KEYS: readonly GridKey[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export type UsePaletteSearchInput = {
  entries: readonly FamousGalaxyMetaEntry[];
  aliasIndex?: readonly AliasIndexEntry[];
  structures?: readonly StructureSearchEntry[];
  /** The shown tab's cards — drives the grid navigator and its Enter target. */
  cards: readonly PaletteCard[];
  /** ⌥←/⌥→ in the grid navigator; the parent maps it to the next/previous shown tab. */
  onTabStep: (delta: 1 | -1) => void;
  open: boolean;
  onClose: () => void;
  /** Fired with the picked row's action; the parent dispatches on `action.kind`. */
  onSelect: (action: PaletteAction) => void;
};

export type UsePaletteSearch = {
  query: string;
  setQuery: (q: string) => void;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  matches: ScoredRow[];
  inputRef: RefObject<HTMLInputElement | null>;
  gridRef: RefObject<HTMLUListElement | null>;
  activeCard: number;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  dispatchSelection: (m: ScoredRow) => void;
  /** Card selection: same action→close bracket as a row pick, but the source
   * is already a `PaletteAction` — a grid card has no `ScoredRow` to map. */
  dispatchAction: (action: PaletteAction) => void;
};

export function usePaletteSearch({
  entries,
  aliasIndex,
  structures,
  cards,
  onTabStep,
  open,
  onClose,
  onSelect,
}: UsePaletteSearchInput): UsePaletteSearch {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeCard, setActiveCard] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLUListElement | null>(null);

  const matches = useMemo(
    () => rankPaletteMatches(entries, aliasIndex, structures, query),
    [entries, aliasIndex, structures, query],
  );

  // Reset highlight when the query changes — otherwise we'd point past the
  // end of a shrinking results list.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Reset the grid highlight on a tab change — otherwise it could point past
  // the end of a shorter tab's card list.
  useEffect(() => {
    setActiveCard(0);
  }, [cards]);

  // Focus the input when the palette opens.  The next tick is needed
  // because the input only enters the DOM in the same render that flips
  // `open` to true.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame instead of useLayoutEffect because the
      // overlay's CSS transition would otherwise see the focused state
      // mid-fade.
      requestAnimationFrame(() => inputRef.current?.focus());
      setQuery('');
    }
  }, [open]);

  /**
   * Resolve the selected row to its `PaletteAction` and hand it to the
   * parent, then close.  Centralised so the click and keyboard paths can't
   * drift apart silently — `actionForRow` names every kind, and the parent
   * dispatches on `action.kind` with the result.
   */
  const dispatchSelection = (m: ScoredRow): void => {
    onSelect(actionForRow(m));
    onClose();
  };

  const dispatchAction = (action: PaletteAction): void => {
    onSelect(action);
    onClose();
  };

  // ── Keyboard handling ──────────────────────────────────────────────────────
  //
  // Esc always closes. With an empty query the grid navigator owns the
  // arrows/Enter/⌥-arrows; with a query the original results-list navigator
  // (wrap past either end, Enter selects) is unchanged. All other keys pass
  // through to the input so the user can type.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (query.trim().length === 0) {
      // Alt-arrow switches tabs — checked before the plain-arrow branch, and
      // preventDefault'd, since macOS otherwise moves the input's caret.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        onTabStep(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (GRID_KEYS.includes(e.key as GridKey)) {
        e.preventDefault();
        const columns = gridRef.current ? measureGridColumns(gridRef.current) : 1;
        setActiveCard((i) => gridIndexStep(i, e.key as GridKey, columns, cards.length));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const card = cards[activeCard];
        if (card) dispatchAction(card.action);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => wrapIndex(i, 1, matches.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => wrapIndex(i, -1, matches.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[activeIdx];
      if (m) dispatchSelection(m);
    }
  };

  return {
    query,
    setQuery,
    activeIdx,
    setActiveIdx,
    matches,
    inputRef,
    gridRef,
    activeCard,
    onKeyDown,
    dispatchSelection,
    dispatchAction,
  };
}
