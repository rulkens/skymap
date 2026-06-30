/**
 * ResultsList — the ranked results <ul> (or the "No matches" empty state).
 *
 * Maps each `ScoredRow` through the `ROW_VIEW` table into one identical <li>
 * (active styling, hover → onActivate, click → onSelect).  Purely
 * presentational: the parent (`CommandPalette`) owns the matches array, the
 * active index, and the dispatch handlers.
 */
import type { ReactNode } from 'react';
import { ROW_VIEW } from './paletteRows';
import type { ScoredRow } from './paletteRowModel';
import styles from './CommandPalette.module.css';

export type ResultsListProps = {
  matches: readonly ScoredRow[];
  activeIdx: number;
  onActivate: (i: number) => void;
  onSelect: (m: ScoredRow) => void;
};

export function ResultsList({
  matches,
  activeIdx,
  onActivate,
  onSelect,
}: ResultsListProps): ReactNode {
  if (matches.length === 0) return <div className={styles.empty}>No matches</div>;
  return (
    <ul className={styles.results}>
      {matches.map((m, i) => {
        const view = ROW_VIEW[m.kind](m);
        const isActive = i === activeIdx;
        return (
          <li
            key={view.key}
            className={`${styles.result} ${isActive ? styles.resultActive : ''}`}
            onMouseEnter={() => onActivate(i)}
            onClick={() => onSelect(m)}
            data-testid={view.testid}
          >
            {view.leading}
            <span>
              <span className={styles.primary}>{view.primary}</span>
              {view.secondary}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
