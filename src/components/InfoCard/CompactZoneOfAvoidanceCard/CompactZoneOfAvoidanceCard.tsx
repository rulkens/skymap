/**
 * CompactZoneOfAvoidanceCard — slim hover-preview for the zone-of-avoidance
 * guide band. Band variant of CompactMilkyWayCard: a small haze glyph next to
 * the "Hover" title, then the name.
 */

import type { ReactNode } from 'react';
import type { ZoneOfAvoidanceInfo } from '../../../@types/engine/ZoneOfAvoidanceInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactZoneOfAvoidanceCard.module.css';

export type CompactZoneOfAvoidanceCardProps = {
  target: ZoneOfAvoidanceInfo;
};

function CompactZoneOfAvoidanceCard({ target }: CompactZoneOfAvoidanceCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span className={local.glyph} aria-hidden="true">
          🌫️
        </span>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.displayName}</CardRow>
    </div>
  );
}

export default CompactZoneOfAvoidanceCard;
