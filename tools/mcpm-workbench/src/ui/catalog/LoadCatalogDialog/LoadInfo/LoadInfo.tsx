/**
 * LoadInfo — what Load will do, above the dialog's footer once a file is
 * chosen: what the file holds, and the Selection box it will leave. Both
 * blocks keep one height from then on, so reading, a re-parse, a problem or
 * the Auto fit switch only swap values in place. Its props are counts and
 * bounds, never the point arrays: React's dev build walks every prop it logs,
 * and a million-point array froze the page for seconds.
 */
import type { ReactNode } from 'react';
import type { CatalogPreview } from '../../../../../@types/catalog/import/CatalogPreview';
import type { UserCatalogLoad } from '../../../../../@types/catalog/UserCatalogLoad';
import CatalogInfo from '../CatalogInfo/CatalogInfo';
import GridInfoContainer from '../../../containers/catalog/GridInfoContainer';
import styles from './LoadInfo.module.css';

export type LoadInfoProps = {
  /** The file's rows; null while reading, or when the file could not be parsed. */
  readonly pointCount: number | null;
  readonly bounds: CatalogPreview['bounds'];
  readonly weight: CatalogPreview['weight'];
  /** What Load will fit the box to; null leaves it as it is. */
  readonly fitBounds: UserCatalogLoad['fitBounds'];
  /** Parsed under settings that have since changed. */
  readonly stale: boolean;
};

function LoadInfo({ pointCount, bounds, weight, fitBounds, stale }: LoadInfoProps): ReactNode {
  return (
    <div className={styles.root}>
      <CatalogInfo pointCount={pointCount} bounds={bounds} weight={weight} stale={stale} />
      <GridInfoContainer pointCount={pointCount} fitBounds={fitBounds} stale={stale} />
    </div>
  );
}

export default LoadInfo;
