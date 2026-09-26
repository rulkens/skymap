/**
 * CompactCard — slim hover-preview for a galaxy, rendered below the pinned
 * GalaxyDetailCard when a second galaxy is hovered.  No thumbnail, no
 * expandable section, no actions.
 */

import type { ReactNode } from 'react';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatLookback } from '../../../utils/format/formatLookback';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactCard.module.css';

export type CompactCardProps = {
  target: GalaxyInfo;
};

function CompactCard({ target }: CompactCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline" badge={target.sourceLabel}>
        {target.displayName}
      </CardRow>
      <div className={styles.cardLookbackLine}>
        Light left {formatLookback(target.lookbackGyr)} ago
      </div>
      <div className={styles.cardLookbackEra}>— {target.earthEra}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(target.distanceMpc)} &middot;{' '}
        {target.morphology ?? target.galaxyType.description}
      </div>
    </div>
  );
}

export default CompactCard;
