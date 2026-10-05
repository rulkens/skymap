/**
 * CompactStarCard — slim hover-preview for a star. Star variant of CompactCard /
 * CompactStructureCard: the headline with a survey star's spectral-class badge
 * (the at-a-glance kind, the galaxy-source / structure-category idiom) plus a
 * short distance line, no thumbnail. The class rides the badge only — it is not
 * repeated on the line.
 */

import type { ReactNode } from 'react';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactStarCard.module.css';

type CompactStarCardProps = {
  target: StarInfo;
};

function CompactStarCard({ target }: CompactStarCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow
        type="headline"
        badge={target.detail.kind === 'photometry' ? target.detail.spectralClass : undefined}
      >
        {target.displayName}
      </CardRow>
      {target.distancePc > 0 && (
        <div className={styles.cardDistLine}>
          {Math.round(target.distancePc).toLocaleString()} pc
        </div>
      )}
    </div>
  );
}

export default CompactStarCard;
