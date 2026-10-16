/*
 * Sources — the page's numbered source list, generated from the fact ids it
 * used. Closed by default: sixteen entries are two phone screens, and the
 * count in the summary says they are there. Only science claims are listed;
 * `all` lists statements about the app too, for the Privacy page.
 */
import { fact } from '../../data/fact.ts';
import { formatDate } from '../../utils/formatDate.ts';
import { listedSources } from '../../utils/listedSources.ts';
import Icon from '../Icon/Icon.tsx';
import styles from './Sources.module.css';

type SourcesProps = { ids: readonly string[]; all?: boolean };

function Sources({ ids, all = false }: SourcesProps) {
  const rows = listedSources([...new Set(ids)].map(fact), all);
  if (rows.length === 0) return null;
  return (
    <details className={styles.root}>
      <summary className={styles.toggle}>
        <Icon name="cite" />
        Sources for this page ({rows.length})
      </summary>
      <ol>
        {rows.map((row, i) => (
          <li key={i}>
            {row.text} <a href={row.source}>{row.sourceLabel}</a>{' '}
            <span className={styles.checked}>
              checked <span className={styles.date}>{formatDate(row.checked)}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default Sources;
