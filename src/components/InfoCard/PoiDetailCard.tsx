/**
 * PoiDetailCard — rich panel for a focused cluster / supercluster / void.
 * Shows name, category, distance from observer, and physical radius.
 */

import type { ReactNode } from 'react';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { formatDistance } from '../../utils/format/distance';
import { POI_CATEGORY_INFO } from '../../data/poiCategoryInfo';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import styles from './DetailCard.module.css';

export type PoiDetailCardProps = {
  poi: PointOfInterest;
  pinned?: boolean;
  onFocus?: (poi: PointOfInterest) => void;
  onClose?: () => void;
};

export function PoiDetailCard({
  poi,
  pinned = false,
  onFocus,
  onClose,
}: PoiDetailCardProps): ReactNode {
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);
  const outerClass = `${styles.infoCardFull} ${styles.poi}${pinned ? ` ${styles.pinned}` : ''}`;

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="POI"
        onFocus={pinned && onFocus ? () => onFocus(poi) : undefined}
        focusAriaLabel={`Focus camera on ${poi.name}`}
        onClose={pinned ? onClose : undefined}
      />

      <div className={styles.cardHeadline}>{poi.name}</div>
      <div className={styles.sourceBadge}>{POI_CATEGORY_INFO[poi.category].label}</div>

      <div className={styles.cardSection}>
        <CardRow label="Distance" value={formatDistance(distanceMpc)} />
        {poi.physicalRadiusMpc !== undefined && (
          <CardRow label="Radius" value={formatDistance(poi.physicalRadiusMpc)} />
        )}
      </div>
    </div>
  );
}
