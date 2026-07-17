/**
 * CompactStarCard — slim hover-preview for a picked survey star.
 * Star variant of CompactCard / CompactStructureCard: the fixed 'Field star'
 * headline plus a short distance · spectral-class line, no thumbnail.
 */

import type { ReactNode } from 'react';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactStarCard.module.css';

export type CompactStarCardProps = {
  info: StarInfo;
};

function CompactStarCard({ info }: CompactStarCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline" badge={info.spectralClass}>
        {info.displayName}
      </CardRow>
      <div className={styles.cardDistLine}>
        {Math.round(info.distancePc).toLocaleString()} pc &middot; {info.spectralClass}
      </div>
    </div>
  );
}

export default CompactStarCard;
