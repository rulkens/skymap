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
import type { ZoneOfAvoidanceInfo } from '../../../@types/engine/ZoneOfAvoidanceInfo';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import WikipediaRow from '../WikipediaRow/WikipediaRow';
import styles from '../cardChrome.module.css';
import zoa from './ZoneOfAvoidanceDetailCard.module.css';

export type ZoneOfAvoidanceDetailCardProps = {
  target: ZoneOfAvoidanceInfo;
  pinned?: boolean;
  chrome?: boolean;
  onClose?: () => void;
};

function ZoneOfAvoidanceDetailCard({
  target,
  pinned = false,
  chrome = true,
  onClose,
}: ZoneOfAvoidanceDetailCardProps): ReactNode {
  const outerClass = cx(zoa.root, pinned && styles.pinned, !chrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader eyebrow="Guide Layer" onClose={pinned ? onClose : undefined} />

      <CardRow type="headline">{target.displayName}</CardRow>

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
