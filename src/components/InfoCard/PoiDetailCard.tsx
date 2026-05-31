/**
 * PoiDetailCard — rich panel for a focused cluster / supercluster / void.
 * Shows name, category, distance from observer, physical radius, and — for
 * clusters carrying one — the Abell/ACO designation.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import cx from 'classnames';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { formatDistance } from '../../utils/format/distance';
import { formatAbellDesignation } from '../../utils/format/formatAbellDesignation';
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
  const [descExpanded, setDescExpanded] = useState(false);
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
        {poi.category !== 'famousGalaxy' && (
          <CardRow label="Radius" value={formatDistance(poi.physicalRadiusMpc)} />
        )}
        {poi.category === 'cluster' && poi.abell !== undefined && (
          <CardRow label="Abell" value={formatAbellDesignation(poi.abell)} />
        )}
        {poi.description && (
          // Curated Wikipedia-lead blurb (featured anchors) or the build's
          // auto one-liner (bulk entries).  Same label-less collapse pattern
          // as GalaxyDetailCard's famous description so the two info cards
          // read identically.
          <div className={styles.cardRow}>
            <span
              className={cx(
                styles.cardValue,
                descExpanded ? styles.descExpanded : styles.descCollapsed,
              )}
              style={{ fontStyle: 'italic' }}
            >
              {poi.description}
            </span>
            <button
              type="button"
              className={styles.descToggle}
              onClick={() => setDescExpanded((v) => !v)}
              aria-expanded={descExpanded}
            >
              {descExpanded ? 'show less' : 'show more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
