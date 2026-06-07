/**
 * CompactCard — slim hover-preview for a galaxy, rendered below the pinned
 * GalaxyDetailCard when a second galaxy is hovered.  No thumbnail, no
 * expandable section, no actions.
 */

import type { ReactNode } from 'react';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { formatDistance } from '../../utils/format/distance';
import styles from './CompactCard.module.css';

export type CompactCardProps = {
  info: GalaxyInfo;
};

export function CompactCard({ info }: CompactCardProps): ReactNode {
  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>{info.displayName}</div>
        <span className={styles.sourceBadge}>{info.sourceLabel}</span>
      </div>
      <div className={styles.cardLookbackLine}>
        Light left {info.lookbackGyr.toFixed(1)} Gyr ago
      </div>
      <div className={styles.cardLookbackEra}>— {info.earthEra}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(info.distanceMpc)} &middot; {info.morphology ?? info.galaxyType.description}
      </div>
    </div>
  );
}
