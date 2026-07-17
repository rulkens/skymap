/**
 * CompactStarCard — slim hover-preview for a famous star.  Star variant of
 * CompactCard / CompactStructureCard: name + constellation, no fetch dependency
 * — the name comes straight from `StarInfo.label` and the constellation from the
 * synchronous compile-time `FAMOUS_STAR_SEARCH` index (the same derivation the
 * command palette's body row uses), so the preview shows instantly on hover,
 * before the meta sidecar (which the detail card resolves) has loaded.
 */

import type { ReactNode } from 'react';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import { FAMOUS_STAR_SEARCH } from '../../../data/bodies/famousStarsIndex';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactStarCard.module.css';

export type CompactStarCardProps = {
  target: StarInfo;
};

function CompactStarCard({ target }: CompactStarCardProps): ReactNode {
  // Only star ids reach a body focusable, so the lookup effectively always
  // hits; guard the miss anyway so an unindexed body renders name-only, never
  // a crash.
  const constellation = FAMOUS_STAR_SEARCH.get(target.id)?.constellation;

  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
      {constellation && <div className={styles.cardDistLine}>{constellation}</div>}
    </div>
  );
}

export default CompactStarCard;
