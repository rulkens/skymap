/**
 * CompactMilkyWayCard — slim hover-preview for the Milky Way singleton.
 * Milky Way variant of CompactCard / CompactStructureCard: a glyph + name +
 * a short type line, no thumbnail (we're inside the galaxy).
 */

import type { ReactNode } from 'react';
import type { MilkyWayInfo } from '../../@types/engine/MilkyWayInfo';
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
      <div className={styles.headlineRow}>
        <span className={styles.glyph} aria-hidden="true">
          🌌
        </span>
        <div className={styles.cardHeadline}>{target.displayName}</div>
      </div>
      <div className={styles.cardDistLine}>{target.typeString}</div>
    </div>
  );
}
