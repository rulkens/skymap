/**
 * ResultsList — the ranked results <ul> (or the "No matches" empty state).
 *
 * Maps each `ScoredRow` through the `ROW_VIEW` table into one identical <li>
 * (active styling, hover → onActivate, click → onSelect).  Purely
 * presentational: the parent (`CommandPalette`) owns the matches array, the
 * active index, and the dispatch handlers.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import { ROW_VIEW } from './paletteRows';
import type { ScoredRow } from './paletteRowModel';
import styles from './ResultsList.module.css';

export type ResultsListProps = {
  readonly matches: readonly ScoredRow[];
  readonly activeIdx: number;
  readonly onActivate: (i: number) => void;
  readonly onSelect: (m: ScoredRow) => void;
};

function ResultsList({ matches, activeIdx, onActivate, onSelect }: ResultsListProps): ReactNode {
  if (matches.length === 0) return <div className={styles.empty}>No matches</div>;
  return (
    <ul className={styles.root}>
      {matches.map((m, i) => {
        const view = ROW_VIEW[m.kind](m);
        const isActive = i === activeIdx;
        return (
          <li
            key={view.key}
            className={cx(styles.row, isActive && styles.rowActive)}
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

export default ResultsList;
