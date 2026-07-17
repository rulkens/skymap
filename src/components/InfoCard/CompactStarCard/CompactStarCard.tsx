/**
 * CompactStarCard — slim hover-preview for a famous star.  Star variant of
 * CompactCard / CompactStructureCard: name + constellation, no fetch dependency
 * — the name comes straight from `StarInfo.label` so the preview shows instantly
 * on hover, before the sidecar (which the detail card resolves) has loaded.
 */

import type { ReactNode } from 'react';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactStarCard.module.css';

export type CompactStarCardProps = {
  target: StarInfo;
};

function CompactStarCard({ target }: CompactStarCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
    </div>
  );
}

export default CompactStarCard;
