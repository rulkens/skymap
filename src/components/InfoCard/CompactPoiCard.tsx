/**
 * CompactPoiCard — slim hover-preview for a cluster / supercluster / void.
 * POI variant of CompactCard, kept as a sibling file so the two can diverge
 * (different distance derivation, different secondary line).
 */

import type { ReactNode } from 'react';
import type { StructureRecord } from '../../@types/engine/data/StructureRecord';
import { formatDistance } from '../../utils/format/distance';
import { POI_CATEGORY_INFO } from '../../data/poiCategoryInfo';
import styles from './CompactPoiCard.module.css';

export type CompactPoiCardProps = {
  poi: StructureRecord;
};

export function CompactPoiCard({ poi }: CompactPoiCardProps): ReactNode {
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);

  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <div className={styles.cardHeadline}>{poi.name}</div>
      <div className={styles.sourceBadge}>{POI_CATEGORY_INFO[poi.category].shortLabel}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(distanceMpc)}
        <> &middot; r {formatDistance(poi.physicalRadiusMpc)}</>
      </div>
    </div>
  );
}
