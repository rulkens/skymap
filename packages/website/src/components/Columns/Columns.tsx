/*
 * Columns — its children side by side in `count` equal columns of the page
 * grid when wide, stacked when narrow. Each child is one column: a heading and
 * what belongs under it. `footLast` stands the last, shorter column on the foot
 * of the row.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Columns.module.css';

type ColumnsProps = { count: 2 | 3; footLast?: boolean; children: ReactNode };

function Columns({ count, footLast = false, children }: ColumnsProps) {
  return (
    <div
      className={cx(
        styles.root,
        count === 2 ? styles.halves : styles.thirds,
        footLast && styles.footLast,
      )}
    >
      {children}
    </div>
  );
}

export default Columns;
