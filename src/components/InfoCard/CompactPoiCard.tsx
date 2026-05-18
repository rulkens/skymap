/**
 * CompactPoiCard — slim hover-preview for a cluster / supercluster / void.
 * POI variant of CompactCard, kept as a sibling file so the two can diverge
 * (different distance derivation, different secondary line).
 */

import type { ReactNode } from 'react';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { formatDistance } from '../../utils/format/distance';
import styles from './CompactPoiCard.module.css';

function poiCategoryLabel(category: PointOfInterest['category']): string {
  switch (category) {
    case 'cluster':
      return 'Cluster';
    case 'supercluster':
      return 'Supercluster';
    case 'void':
      return 'Void';
    case 'famousGalaxy':
      return 'Galaxy';
  }
}

export type CompactPoiCardProps = {
  poi: PointOfInterest;
};

export function CompactPoiCard({ poi }: CompactPoiCardProps): ReactNode {
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);

  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <div className={styles.cardHeadline}>{poi.name}</div>
      <div className={styles.sourceBadge}>{poiCategoryLabel(poi.category)}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(distanceMpc)}
        {poi.physicalRadiusMpc !== undefined && (
          <>
            {' '}
            &middot; r {formatDistance(poi.physicalRadiusMpc)}
          </>
        )}
      </div>
    </div>
  );
}
