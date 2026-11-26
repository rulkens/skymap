/**
 * CatalogInfo — what the chosen file holds as it will load with the current
 * settings: rows, the stored weights' mean and spread, and the bounds per axis
 * (the last two worked out with the parse, in the catalog worker). Its labels
 * and values sit on LoadInfo's `file` tracks; until a parse is in, every value
 * is a dash in the same rows, so nothing changes height.
 */
import { Fragment, type ReactNode } from 'react';
import type { CatalogPreview } from '../../../../../@types/catalog/import/CatalogPreview';
import { formatWeight } from '../../../../utils/format/formatWeight';
import { AXES } from '../../../panel/data/axes.constant';
import { formatBoundMpc } from '../utils/formatBoundMpc';
import styles from './CatalogInfo.module.css';

export type CatalogInfoProps = {
  /** Null while reading, or when the file could not be parsed. */
  readonly pointCount: number | null;
  readonly bounds: CatalogPreview['bounds'];
  readonly weight: CatalogPreview['weight'];
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function CatalogInfo({ pointCount, bounds, weight, stale }: CatalogInfoProps): ReactNode {
  const rows = pointCount ? pointCount.toLocaleString() : '—';

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
        {pointCount ? `${rows} rows read` : ''}
      </p>
    </section>
  );
}

export default CatalogInfo;
