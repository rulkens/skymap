/**
 * BlackHoleDetailCard — rich panel for a selected black hole: name, designation,
 * mass, horizon radius, distance, then the compiled-in `BODY_FACTS` wiki link
 * and description (keyed by the hole's id). The hole never moves, so the
 * distance is read off the target's position rather than a live pub.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BlackHoleInfo } from '../../../../@types/engine/BlackHoleInfo';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';
import { BODY_FACTS } from '../../../../data/bodies/bodyFacts.generated';
import { formatDistance } from '../../../../utils/format/formatDistance';
import { formatRadiusM } from '../../../../utils/format/formatRadiusM';
import CardHeader from '../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import DescriptionBlock from '../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import WikipediaRow from '../../../../components/InfoCard/WikipediaRow/WikipediaRow';
import styles from '../../../../components/InfoCard/cardChrome.module.css';
import local from './BlackHoleDetailCard.module.css';

export type BlackHoleDetailCardProps = {
  target: BlackHoleInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function BlackHoleDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: BlackHoleDetailCardProps): ReactNode {
  const facts = BODY_FACTS[target.id];
  const [x, y, z] = target.positionMpc;
  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Black hole"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.label}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.label}</CardRow>

      <div className={styles.cardSection}>
        <CardRow label="Designation" value={target.detailLabel} />
        <CardRow label="Mass" value={`${(target.massSolar / 1e6).toFixed(1)} million M☉`} />
        <CardRow label="Radius" value={formatRadiusM(target.schwarzschildRadiusM)} />
        <CardRow label="Distance" value={formatDistance(Math.hypot(x, y, z))} />
      </div>

      {facts && (
        <div className={styles.cardSection}>
          <WikipediaRow title={facts.wikiTitle} />
        </div>
      )}
      {facts?.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={facts.description} />
        </div>
      )}
    </div>
  );
}

export default BlackHoleDetailCard;
