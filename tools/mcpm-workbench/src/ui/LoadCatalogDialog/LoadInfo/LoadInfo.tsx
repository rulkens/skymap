/**
 * LoadInfo — what Load will do, above the dialog's footer once a file is
 * chosen: what the file holds, and the Selection box it will leave. Both
 * blocks keep one height from then on, so reading, a re-parse, a problem or
 * the Auto fit switch only swap values in place.
 */
import type { ReactNode } from 'react';
import type { UserCatalog } from '../../../../@types/UserCatalog';
import type { UserCatalogLoad } from '../../../../@types/UserCatalogLoad';
import CatalogInfo from '../CatalogInfo/CatalogInfo';
import GridInfo from '../GridInfo/GridInfo';
import styles from './LoadInfo.module.css';

export type LoadInfoProps = {
  /** Null while reading, or when the file could not be parsed. */
  readonly catalog: UserCatalog | null;
  /** What Load will fit the box to; null leaves it as it is. */
  readonly fitBounds: UserCatalogLoad['fitBounds'];
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function LoadInfo({ catalog, fitBounds, stale }: LoadInfoProps): ReactNode {
  return (
    <div className={styles.root}>
      <CatalogInfo catalog={catalog} stale={stale} />
      <GridInfo catalog={catalog} fitBounds={fitBounds} stale={stale} />
    </div>
  );
}

export default LoadInfo;
