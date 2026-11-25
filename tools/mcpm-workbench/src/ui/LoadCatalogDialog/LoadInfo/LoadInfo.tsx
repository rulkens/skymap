/**
 * LoadInfo — what Load will do, above the dialog's footer once a file is
 * chosen: what the file holds, and the Selection box it will leave. Both
 * blocks keep one height from then on, so reading, a re-parse, a problem or
 * the Auto fit switch only swap values in place.
 */
import type { ReactNode } from 'react';
import type { CatalogPreview } from '../../../../@types/CatalogPreview';
import type { UserCatalogLoad } from '../../../../@types/UserCatalogLoad';
import CatalogInfo from '../CatalogInfo/CatalogInfo';
import GridInfo from '../GridInfo/GridInfo';
import styles from './LoadInfo.module.css';

export type LoadInfoProps = {
  /** Null while reading. */
  readonly preview: CatalogPreview | null;
  /** What Load will fit the box to; null leaves it as it is. */
  readonly fitBounds: UserCatalogLoad['fitBounds'];
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function LoadInfo({ preview, fitBounds, stale }: LoadInfoProps): ReactNode {
  const outcome = preview?.outcome;
  const catalog = outcome && outcome.kind !== 'problem' ? outcome.catalog : null;
  return (
    <div className={styles.root}>
      <CatalogInfo
        catalog={catalog}
        bounds={preview?.bounds ?? null}
        weight={preview?.weight ?? null}
        stale={stale}
      />
      <GridInfo catalog={catalog} fitBounds={fitBounds} stale={stale} />
    </div>
  );
}

export default LoadInfo;
