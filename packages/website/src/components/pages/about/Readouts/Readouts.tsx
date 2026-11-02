/*
 * Readouts — a titled block of sourced facts set the way the app's info card sets a body's figures: a name and
 * its value on one line, here over the fact row's own sentence and the link that backs it. Wide, they stand in
 * thirds of the page grid and share their rows (subgrid), so every value, sentence and source sits level with
 * its neighbours'. The children (a row of links) close the block.
 */
import type { ReactNode } from 'react';

import { fact } from '../../../../data/fact.ts';
import styles from './Readouts.module.css';

type ReadoutsProps = {
  title: string;
  items: readonly { term: string; value: string; id: string }[];
  children?: ReactNode;
};

function Readouts({ title, items, children }: ReadoutsProps) {
  return (
    <div className={styles.root}>
      <h3>{title}</h3>
      <dl className={styles.list}>
        {items.map(({ term, value, id }) => {
          const row = fact(id);
          return (
            <div key={id}>
              <dt>{term}</dt>
              <dd className={styles.value}>{value}</dd>
              <dd className={styles.text}>{row.text}</dd>
              <dd className={styles.source}>
                <a href={row.source}>Source: {row.sourceLabel}</a>
              </dd>
            </div>
          );
        })}
      </dl>
      {children}
    </div>
  );
}

export default Readouts;
