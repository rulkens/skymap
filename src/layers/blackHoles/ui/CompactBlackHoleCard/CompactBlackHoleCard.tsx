/**
 * CompactBlackHoleCard — slim hover-preview for a black hole: name and distance,
 * both synchronous off the target, so the preview shows the instant it hovers.
 */

import type { ReactNode } from 'react';
import type { BlackHoleInfo } from '../../../../@types/engine/BlackHoleInfo';
import { formatDistance } from '../../../../utils/format/formatDistance';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../components/InfoCard/compactChrome.module.css';
import local from './CompactBlackHoleCard.module.css';

export type CompactBlackHoleCardProps = {
  target: BlackHoleInfo;
};

function CompactBlackHoleCard({ target }: CompactBlackHoleCardProps): ReactNode {
  const [x, y, z] = target.positionMpc;
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
      <div className={styles.cardDistLine}>{formatDistance(Math.hypot(x, y, z))}</div>
    </div>
  );
}

export default CompactBlackHoleCard;
