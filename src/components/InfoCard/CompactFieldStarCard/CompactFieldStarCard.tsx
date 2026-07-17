/**
 * CompactFieldStarCard — slim hover-preview for a picked survey star.
 * Star variant of CompactCard / CompactStructureCard: the fixed 'Field star'
 * headline plus a short distance · spectral-class line, no thumbnail.
 */

import type { ReactNode } from 'react';
import type { FieldStarInfo } from '../../../@types/engine/FieldStarInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactFieldStarCard.module.css';

export type CompactFieldStarCardProps = {
  info: FieldStarInfo;
};

function CompactFieldStarCard({ info }: CompactFieldStarCardProps): ReactNode {
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

export default CompactFieldStarCard;
