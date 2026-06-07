/**
 * PoiDetailCard — rich panel for a focused cluster / supercluster / void.
 * Shows name, category, distance from observer, physical radius, and — for
 * clusters carrying one — the Abell/ACO designation.
 */

import type { ReactNode } from 'react';
import type { StructureRecord } from '../../@types/engine/data/StructureRecord';
import { formatDistance } from '../../utils/format/distance';
import { formatAbellDesignation } from '../../utils/format/formatAbellDesignation';
import { POI_CATEGORY_INFO } from '../../data/poiCategoryInfo';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { DescriptionBlock } from './DescriptionBlock';
import { InfoTip } from '../InfoTip/InfoTip';
import { TIPS } from './tooltips';
import styles from './DetailCard.module.css';

export type PoiDetailCardProps = {
  poi: StructureRecord;
  pinned?: boolean;
  /**
   * Catalogued galaxies inside this structure's membership sphere at the
   * current tier + survey visibility, or null/undefined when not countable
   * (famous-galaxy POI, or catalogs not loaded yet) — in which case the
   * row is omitted rather than flashing a misleading "0".
   */
  memberCount?: number | null;
  onFocus?: (poi: StructureRecord) => void;
  onClose?: () => void;
};

export function PoiDetailCard({
  poi,
  pinned = false,
  memberCount,
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

      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>{poi.name}</div>
        <span className={styles.sourceBadge}>{POI_CATEGORY_INFO[poi.category].label}</span>
      </div>

      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.structureDistance!}>Distance</InfoTip>}
          value={formatDistance(distanceMpc)}
        />
        <CardRow
          label={<InfoTip {...TIPS.structureRadius!}>Radius</InfoTip>}
          value={formatDistance(poi.physicalRadiusMpc)}
        />
        {memberCount != null && (
          <CardRow
            label={<InfoTip {...TIPS.memberCount!}>Galaxies</InfoTip>}
            value={memberCount.toLocaleString()}
          />
        )}
        {poi.category === 'cluster' && poi.abell !== undefined && (
          <CardRow
            label={<InfoTip {...TIPS.abell!}>Abell</InfoTip>}
            value={formatAbellDesignation(poi.abell)}
          />
        )}
        {poi.description && (
          // Curated Wikipedia-lead blurb (featured anchors) or the build's
          // auto one-liner (bulk entries).  Shares DescriptionBlock with
          // GalaxyDetailCard so the show-more toggle sits in the same place.
          <DescriptionBlock text={poi.description} />
        )}
      </div>
    </div>
  );
}
