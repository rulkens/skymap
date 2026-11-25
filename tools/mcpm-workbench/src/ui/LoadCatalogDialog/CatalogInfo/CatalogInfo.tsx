/**
 * CatalogInfo — what the chosen file holds as it will load with the current
 * settings: rows, the stored weights' mean and spread, and the bounds per axis.
 * Mounted once a file is chosen; from then on its height never changes, so
 * reading, a re-parse or a problem swap values for dashes in place.
 */
import { useMemo, type ReactNode } from 'react';
import type { UserCatalog } from '../../../../@types/UserCatalog';
import { catalogBounds } from '../../../field/catalogBounds';
import { formatWeight } from '../../../field/formatWeight';
import { meanStdDev } from '../../../utils/meanStdDev';
import { formatSizeMpc } from '../../GridBoxPanel/utils/formatSizeMpc';
import styles from './CatalogInfo.module.css';

export type CatalogInfoProps = {
  /** Null while reading, or when the file could not be parsed. */
  readonly catalog: UserCatalog | null;
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function CatalogInfo({ catalog, stale }: CatalogInfoProps): ReactNode {
  const points = catalog && catalog.points.count > 0 ? catalog.points : null;
  const bounds = useMemo(() => points && catalogBounds(points.positions), [points]);
  const weight = useMemo(() => points && meanStdDev(points.weight), [points]);
  const rows = points ? points.count.toLocaleString() : '—';

  return (
    <section className={styles.root} aria-label="File contents">
      <div className={styles.content} data-stale={stale}>
        <p className={styles.line}>
          {rows} <span className={styles.muted}>rows ·</span>{' '}
          <span className={styles.muted}>weight</span>{' '}
          {weight ? `${formatWeight(weight.mean)} ± ${formatWeight(weight.stdDev)}` : '—'}
        </p>
        <p className={styles.bounds}>
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <span key={axis} className={styles.line}>
              <span className={styles.muted}>{axis}</span>{' '}
              {bounds ? `${formatSizeMpc(bounds.min[i]!)}…${formatSizeMpc(bounds.max[i]!)}` : '—'}
              {axis === 'z' && <span className={styles.muted}> Mpc</span>}
            </span>
          ))}
        </p>
      </div>
      {/* One announcement per read; the values are read on demand. */}
      <p role="status" className={styles.announce}>
        {points ? `${rows} rows read` : ''}
      </p>
    </section>
  );
}

export default CatalogInfo;
