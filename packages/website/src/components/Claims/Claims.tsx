/*
 * Claims — a list of sourced statements, each a short name beside the fact
 * row's own words and the link that backs them. Wide, names run down a left
 * column so the list scans: three columns of the page grid, or two in a list
 * that has half the page (`narrow`). Narrow, each name sits over its statement.
 */
import { fact } from '../../data/fact.ts';
import { cx } from '../../utils/cx.ts';
import styles from './Claims.module.css';

type ClaimsProps = { items: readonly { term: string; id: string }[]; narrow?: boolean };

function Claims({ items, narrow = false }: ClaimsProps) {
  return (
    <dl className={cx(styles.root, narrow && styles.narrow)}>
      {items.map(({ term, id }) => {
        const row = fact(id);
        return (
          <div key={id}>
            <dt>{term}</dt>
            <dd>
              {row.text} <a href={row.source}>Source: {row.sourceLabel}</a>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default Claims;
