/**
 * ZoneOfAvoidanceDetailCard — rich panel for the zone-of-avoidance guide band.
 *
 * Mirrors MilkyWayDetailCard's layout (headline row, then the description),
 * plus a WikipediaRow just above the description — the same slot BodyDetailCard
 * uses. The target has no position: the band is a line-of-sight extinction
 * effect, not a "there" to fly to, so this card never wires CardHeader's
 * `onFocus` — the Focus pill simply doesn't render (see ZoneOfAvoidanceInfo's
 * doc comment for why).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { ZoneOfAvoidanceInfo } from '../../../../@types/engine/ZoneOfAvoidanceInfo';
import CardHeader from '../../../../components/InfoCard/CardHeader/CardHeader';
import DescriptionBlock from '../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import WikipediaRow from '../../../../components/InfoCard/WikipediaRow/WikipediaRow';
import styles from '../../../../components/InfoCard/cardChrome.module.css';
import zoa from './ZoneOfAvoidanceDetailCard.module.css';

export type ZoneOfAvoidanceDetailCardProps = {
  target: ZoneOfAvoidanceInfo;
  isPinned?: boolean;
  hasChrome?: boolean;
  onClose?: () => void;
};

function ZoneOfAvoidanceDetailCard({
  target,
  isPinned = false,
  hasChrome = true,
  onClose,
}: ZoneOfAvoidanceDetailCardProps): ReactNode {
  const outerClass = cx(zoa.root, isPinned && styles.pinned, !hasChrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Guide Layer"
        title={target.displayName}
        onClose={isPinned ? onClose : undefined}
      />

      <div className={styles.cardSection}>
        <WikipediaRow title={target.wikiTitle} />
      </div>

      <div className={styles.cardSection}>
        <DescriptionBlock text={target.description} />
      </div>
    </div>
  );
}

export default ZoneOfAvoidanceDetailCard;
