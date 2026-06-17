/**
 * CompactMilkyWayCard — slim hover-preview for the Milky Way singleton.
 * Milky Way variant of CompactCard / CompactStructureCard: name +
 * a short type line, no thumbnail (we're inside the galaxy).
 */

import type { ReactNode } from 'react';
import type { MilkyWayInfo } from '../../@types/engine/MilkyWayInfo';
import CardRow from './CardRow/CardRow';
import styles from './CompactMilkyWayCard.module.css';

export type CompactMilkyWayCardProps = {
  target: MilkyWayInfo;
};

export function CompactMilkyWayCard({ target }: CompactMilkyWayCardProps): ReactNode {
  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.displayName}</CardRow>
      <div className={styles.cardDistLine}>{target.typeString}</div>
    </div>
  );
}
