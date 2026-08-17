/**
 * usePaletteSearch — owns the command palette's transient search state and
 * keyboard navigation: the query string, the active-row highlight, the input
 * ref, the ranked `matches` memo, the open/query reset effects, and the
 * select + key-down handlers.
 *
 * Pulled out of the `CommandPalette` shell so the component is reduced to
 * layout + subcomponent wiring; everything stateful lives here.  On select it
 * maps the chosen row to its durable focus id (`focusIdForRow`) and hands that
 * to the single `onSelect(focusId)` callback — the shell's parent fires
 * `requestFocus` with it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject, KeyboardEvent } from 'react';
import { rankPaletteMatches } from './utils/rankPaletteMatches';
import { focusIdForRow } from './utils/focusIdForRow';
import { wrapIndex } from './utils/wrapIndex';
import type { ScoredRow } from './paletteRowModel';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';

export type UsePaletteSearchInput = {
  entries: readonly FamousGalaxyMetaEntry[];
  aliasIndex?: readonly AliasIndexEntry[];
  structures?: readonly StructureSearchEntry[];
  open: boolean;
  onClose: () => void;
  /** Fired with the picked row's durable focus id; the parent runs `requestFocus`. */
  onSelect: (focusId: string) => void;
};

export type UsePaletteSearch = {
  query: string;
  setQuery: (q: string) => void;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  matches: ScoredRow[];
  inputRef: RefObject<HTMLInputElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  dispatchSelection: (m: ScoredRow) => void;
};

export function usePaletteSearch({
  entries,
  aliasIndex,
  structures,
  open,
  onClose,
  onSelect,
}: UsePaletteSearchInput): UsePaletteSearch {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(
    () => rankPaletteMatches(entries, aliasIndex, structures, query),
    [entries, aliasIndex, structures, query],
  );

  // Reset highlight when the query changes — otherwise we'd point past the
  // end of a shrinking results list.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

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
   * Resolve the selected row to its durable focus id and hand it to the
   * parent, then close.  Centralised so the click and keyboard paths can't
   * drift apart silently — `focusIdForRow` names every kind, and the parent
   * fires the single `requestFocus` command with the result.
   */
  const dispatchSelection = (m: ScoredRow): void => {
    onSelect(focusIdForRow(m));
    onClose();
  };

  // ── Keyboard handling ──────────────────────────────────────────────────────
  //
  // Up/Down arrows navigate (wrapping past either end so Up on the top row
  // jumps to the bottom), Enter selects, Esc closes.  All other keys pass
  // through to the input so the user can type.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
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
    onKeyDown,
    dispatchSelection,
  };
}
