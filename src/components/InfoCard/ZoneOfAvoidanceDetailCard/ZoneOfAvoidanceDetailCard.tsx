/**
 * ZoneOfAvoidanceDetailCard — rich panel for the zone-of-avoidance guide band.
 *
 * Mirrors MilkyWayDetailCard's layout (headline row, then a glyph + summary in
 * a cardTopRow, then the description), but for a target with no position: the
 * band is a line-of-sight extinction effect, not a "there" to fly to, so this
 * card never wires CardHeader's `onFocus` — the Focus pill simply doesn't
 * render (see ZoneOfAvoidanceInfo's doc comment for why).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { ZoneOfAvoidanceInfo } from '../../../@types/engine/ZoneOfAvoidanceInfo';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
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

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        {/* Haze glyph in place of a thumbnail — the band has no "there" to photograph. */}
        <div className={zoa.glyph} aria-hidden="true">
          🌫️
        </div>
        <div className={styles.cardSummary}>
          <div className={styles.cardDistLine}>{target.distanceNote}</div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <DescriptionBlock text={target.description} />
      </div>
    </div>
  );
}

export default ZoneOfAvoidanceDetailCard;
