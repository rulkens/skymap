/**
 * CompactBodyCard — slim hover-preview for a scene body.  Body variant of
 * CompactCard / CompactStructureCard: name + constellation, no fetch dependency
 * — the name comes straight from `BodyInfo.label` and the constellation from the
 * synchronous compile-time `FAMOUS_STAR_SEARCH` index (the same derivation the
 * command palette's body row uses), so the preview shows instantly on hover,
 * before the meta sidecar (which the detail card resolves) has loaded.
 */

import type { ReactNode } from 'react';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import { FAMOUS_STAR_SEARCH } from '../../../data/bodies/famousStarsIndex';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactBodyCard.module.css';

export type CompactBodyCardProps = {
  target: BodyInfo;
};

function CompactBodyCard({ target }: CompactBodyCardProps): ReactNode {
  // A non-star body (a planet) or an id absent from the index misses
  // FAMOUS_STAR_SEARCH and renders name-only; a famous star hits and shows its
  // constellation. The guard keeps the miss a graceful name-only render, never
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

export default CompactBodyCard;
