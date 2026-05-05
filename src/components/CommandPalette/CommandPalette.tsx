/**
 * CommandPalette — Cmd+K (or Ctrl+K, or `/`) overlay for searching the
 * curated famous-galaxies atlas.
 *
 * UX:
 *   - Triggered by a keyboard shortcut (handled in App.tsx).
 *   - Shows a list of matching galaxies sorted by `scoreFamousMatch`.
 *   - Up/Down arrows move the highlight; Enter selects.
 *   - Esc closes without action.
 *   - Click outside the panel closes.
 *
 * Selection invokes the `onSelect` callback with the picked entry's id;
 * the parent (App.tsx) translates that into an engine `selectFamous(id)`
 * call which pins the galaxy and triggers a focus tween.
 *
 * Why not a third-party command-palette library?  Two reasons: (1) we
 * only need ~80 lines of UI logic for a single feature; pulling in
 * cmdk or kbar to do that would dwarf the actual code with adapter
 * shims.  (2) Project convention forbids introducing component-level
 * barrel exports; many palette libraries assume them.  Hand-rolling
 * keeps the dependency footprint minimal and the styling fully
 * controllable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { scoreFamousMatch } from './scoreFamousMatch';
import type { FamousMetaEntry } from '../../services/engine/famousMetaLoader';
import styles from './CommandPalette.module.css';

export type CommandPaletteProps = {
  /** All famous entries to search across.  Loaded from `famous_meta.json`. */
  entries: FamousMetaEntry[];
  /** Whether the palette is currently shown. */
  open: boolean;
  /** Close handler — called on Esc, click-outside, or after a successful selection. */
  onClose: () => void;
  /** Selection handler — receives the picked entry's id. */
  onSelect: (id: string) => void;
};

/** A scored entry, ready to render. */
type ScoredEntry = { entry: FamousMetaEntry; score: number };

export function CommandPalette({
  entries,
  open,
  onClose,
  onSelect,
}: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Filter + rank entries by the current query ─────────────────────────────
  //
  // Empty query shows the first 20 entries unsorted (the seed file ordering),
  // so the user sees something useful when the palette opens.  Non-empty
  // query runs the scoring helper and drops anything with score <= 0.
  const matches: ScoredEntry[] = useMemo(() => {
    if (query.trim().length === 0) {
      return entries.slice(0, 20).map((e) => ({ entry: e, score: 0 }));
    }
    const scored = entries
      .map((entry) => ({ entry, score: scoreFamousMatch(entry, query) }))
      .filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20);
  }, [entries, query]);

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

  // ── Keyboard handling ──────────────────────────────────────────────────────
  //
  // Up/Down arrows navigate, Enter selects, Esc closes.  All other keys
  // pass through to the input so the user can type.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[activeIdx];
      if (m) {
        onSelect(m.entry.id);
        onClose();
      }
    }
  };

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search famous galaxies"
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search famous galaxies (M31, Andromeda, …)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length === 0 ? (
          <div className={styles.empty}>No matches</div>
        ) : (
          <ul className={styles.results}>
            {matches.map((m, i) => (
              <li
                key={m.entry.id}
                className={`${styles.result} ${i === activeIdx ? styles.resultActive : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => {
                  onSelect(m.entry.id);
                  onClose();
                }}
              >
                <img
                  className={styles.thumb}
                  src={`/images/famous/${m.entry.id}.webp`}
                  alt=""
                  loading="lazy"
                />
                <span>
                  <span className={styles.primary}>{m.entry.names[0]}</span>
                  {m.entry.names.length > 1 && (
                    <span className={styles.secondary}>{m.entry.names.slice(1).join(' · ')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
