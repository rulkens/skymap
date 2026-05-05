/**
 * CompactCard — a slimmer info card shown below the pinned FullCard when the
 * user hovers over a second point while a selection is active.
 *
 * Contains only: SDSS name, lookback / era, galaxy type, and distance.
 * No thumbnail, no expandable section, no external link — visual weight is
 * deliberately lower than the FullCard above it.
 *
 * All layout comes from CompactCard.module.css; the class names map
 * directly to the former global CSS classes in index.html.
 */

import type { ReactNode } from 'react';
import type { PointInfo } from '../../@types';
import { formatDistance } from '../../utils/format/distance';
import styles from './CompactCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props for CompactCard. */
export type CompactCardProps = {
  info: PointInfo;
};

// ── CompactCard ────────────────────────────────────────────────────────────────

/**
 * The slim hover-preview card rendered below the pinned FullCard when both
 * a selected and a hovered point are active simultaneously.
 *
 * @example
 * // Inside InfoCard (when hovered ≠ selected):
 * <CompactCard info={hovered} />
 */
export function CompactCard({ info }: CompactCardProps): ReactNode {
  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <div className={styles.cardHeadline}>{info.displayName}</div>
      {/*
        Smaller variant of the FullCard source badge so the user knows where
        the hovered row's data came from without taking up much room in the
        already-compact preview.
      */}
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>
      <div className={styles.cardLookbackLine}>
        Light left {info.lookbackGyr.toFixed(1)} Gyr ago
      </div>
      <div className={styles.cardLookbackEra}>— {info.earthEra}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(info.distanceMpc)} &middot; {info.galaxyType.description}
      </div>
    </div>
  );
}
