/*
 * ReadingIndex — a page's closing list of where to read on (the children, ObjLinks), one to a ruled row in the
 * right half as Claims rows are ruled, with the name in the left half and the `foot` slot (the launch button)
 * standing on the foot of the row under it. A slot, as MDX cannot hand JSX to a React prop. Stacked when narrow.
 */
import type { ReactNode } from 'react';

import styles from './ReadingIndex.module.css';

type ReadingIndexProps = { title: string; foot: ReactNode; children: ReactNode };

function ReadingIndex({ title, foot, children }: ReadingIndexProps) {
  return (
    <div className={styles.root}>
      <h2>{title}</h2>
      <nav className={styles.links} aria-label={title}>
        {children}
      </nav>
      <div className={styles.foot}>{foot}</div>
    </div>
  );
}

export default ReadingIndex;
