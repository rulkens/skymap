/**
 * MilkyWayDetailCard — rich panel for the Milky Way singleton.
 *
 * Mirrors the shared galaxy/structure layout (headline row, then image slot +
 * summary in a cardTopRow): there's no external thumbnail to fetch (we're
 * inside the galaxy), so a spiral glyph sits in the image slot rather than an
 * <img>.  Shows the name, morphological type (`typeString` — distinct from the
 * union `type` tag), a distance note (we're inside the galaxy, so the usual
 * catalog distance is undefined), and the description.  The focus action lives
 * in the shared CardHeader (the "Focus" pill, shown when the card is pinned).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { MilkyWayInfo } from '../../@types/engine/MilkyWayInfo';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { MILKY_WAY_INFO } from '../../data/milkyWay/milkyWayInfo';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { DescriptionBlock } from './DescriptionBlock';
import styles from './cardChrome.module.css';
import mw from './MilkyWayDetailCard.module.css';

export type MilkyWayDetailCardProps = {
  target: MilkyWayInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

export function MilkyWayDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: MilkyWayDetailCardProps): ReactNode {
  const outerClass = cx(
    styles.infoCardFull,
    styles.structure,
    pinned && styles.pinned,
    !chrome && styles.chromeless,
  );

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Home Galaxy"
        onFocus={pinned && onFocus ? () => onFocus(MILKY_WAY_INFO) : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.displayName}</CardRow>

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        {/* Spiral glyph in place of a thumbnail — we're inside the galaxy. */}
        <div className={mw.glyph} aria-hidden="true">
          🌌
        </div>
        <div className={styles.cardSummary}>
          <div className={styles.cardTypeLine}>{target.typeString}</div>
          <div className={styles.cardDistLine}>{target.distanceNote}</div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <DescriptionBlock text={target.description} />
      </div>
    </div>
  );
}
