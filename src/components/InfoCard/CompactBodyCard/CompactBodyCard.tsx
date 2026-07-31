/**
 * CompactBodyCard — slim hover-preview for a scene body.  Body variant of
 * CompactCard / CompactStructureCard: name + constellation, no fetch dependency
 * — the name comes straight from `BodyInfo.label` and the constellation from the
 * synchronous compile-time `constellationOfBody` lookup, so the preview shows
 * instantly on hover, before the meta sidecar (which the detail card resolves)
 * has loaded.
 */

import type { ReactNode } from 'react';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import { constellationOfBody } from '../../../utils/scene/constellationOfBody';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactBodyCard.module.css';

export type CompactBodyCardProps = {
  target: BodyInfo;
};

function CompactBodyCard({ target }: CompactBodyCardProps): ReactNode {
  // A non-star body (a planet), or a star in no constellation (the Sun),
  // renders name-only rather than printing a chip it cannot fill. The palette's
  // region fallback has no analogue here — this card carries no region row.
  const constellation = constellationOfBody(target.id);

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
