/*
 * Row — one labelled row of a `<dl data-embed>` on a docs page: the label in
 * the first two of the text's columns, as a docs table's names are, and what
 * it labels in the rest, with one rule over the row. Under 700px the label
 * stands over its words. The summary of a source, an entry of the credits
 * and the list of `Use` terms are all rows of this kind.
 */
import type { ReactNode } from 'react';

import styles from './Row.module.css';

type RowProps = { label?: ReactNode; children?: ReactNode };

function Row({ label, children }: RowProps) {
  return (
    <div className={styles.root}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.words}>{children}</dd>
    </div>
  );
}

export default Row;
