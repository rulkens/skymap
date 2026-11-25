/**
 * CatalogInfo — what the chosen file holds as it will load with the current
 * settings: rows, the stored weights' mean and spread, and the bounds per axis
 * (the last two worked out with the parse, in the catalog worker). Its labels
 * and values sit on LoadInfo's `file` tracks; until a parse is in, every value
 * is a dash in the same rows, so nothing changes height.
 */
import { Fragment, type ReactNode } from 'react';
import type { CatalogPreview } from '../../../../@types/CatalogPreview';
import type { UserCatalog } from '../../../../@types/UserCatalog';
import { formatWeight } from '../../../field/formatWeight';
import { AXES } from '../../GridBoxPanel/utils/AXES';
import { formatBoundMpc } from '../utils/formatBoundMpc';
import styles from './CatalogInfo.module.css';

export type CatalogInfoProps = {
  /** Null while reading, or when the file could not be parsed. */
  readonly catalog: UserCatalog | null;
  readonly bounds: CatalogPreview['bounds'];
  readonly weight: CatalogPreview['weight'];
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function CatalogInfo({ catalog, bounds, weight, stale }: CatalogInfoProps): ReactNode {
  const points = catalog && catalog.points.count > 0 ? catalog.points : null;
  const rows = points ? points.count.toLocaleString() : '—';

  return (
    <section className={styles.root} aria-label="File contents" data-stale={stale}>
      <dl className={styles.list}>
        <dt className={styles.label}>rows</dt>
        <dd className={styles.value}>{rows}</dd>
        <dt className={styles.label}>weight</dt>
        <dd className={styles.value}>
          {weight ? `${formatWeight(weight.mean)} ± ${formatWeight(weight.stdDev)}` : '—'}
        </dd>
        {AXES.map(({ axis, label }) => (
          <Fragment key={label}>
            <dt className={styles.label}>{label}</dt>
            <dd className={styles.range}>
              <span>{bounds ? formatBoundMpc(bounds.min[axis]) : '—'}</span>
              <span>{bounds ? formatBoundMpc(bounds.max[axis]) : ''}</span>
              <span className={styles.unit}>{bounds && axis === 2 ? 'Mpc' : ''}</span>
            </dd>
          </Fragment>
        ))}
      </dl>
      {/* One announcement per read; the values are read on demand. */}
      <p role="status" className={styles.announce}>
        {points ? `${rows} rows read` : ''}
      </p>
    </section>
  );
}

export default CatalogInfo;
