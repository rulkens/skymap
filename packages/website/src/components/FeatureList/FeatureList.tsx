/*
 * FeatureList — the features of one group of the Features page: each a name,
 * which links to its page in the docs, over one line saying what it does.
 * `columns` 2 runs the list down two columns of the page grid when wide.
 */
import type { FeatureItem } from '../../@types/FeatureItem';
import { cx } from '../../utils/cx.ts';
import { sitePath } from '../../utils/sitePath.ts';
import styles from './FeatureList.module.css';

type FeatureListProps = { items: readonly FeatureItem[]; columns?: 1 | 2 };

function FeatureList({ items, columns = 1 }: FeatureListProps) {
  return (
    <ul className={cx(styles.root, columns === 2 && styles.two)}>
      {items.map((item) => (
        <li key={`${item.name}|${item.doc}`}>
          <a href={sitePath(item.doc)}>{item.name}</a>
          <span className={styles.line}>{item.line}</span>
        </li>
      ))}
    </ul>
  );
}

export default FeatureList;
