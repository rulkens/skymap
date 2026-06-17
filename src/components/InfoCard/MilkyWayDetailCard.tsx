/**
 * MilkyWayDetailCard — rich panel for the Milky Way singleton.
 *
 * Mirrors StructureDetailCard's shape but for the one-instance Milky Way:
 * there's no external thumbnail to fetch (we're inside it), so the image slot
 * is a glyph rather than an <img>.  Shows the name, morphological type
 * (`typeString` — distinct from the union `type` tag), a distance note (we're
 * inside the galaxy, so the usual catalog distance is undefined), the
 * description, and a "Fly here" button that routes through the same
 * `onFocus(MILKY_WAY_INFO)` → `camera.focusOn` path every other target uses.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { MilkyWayInfo } from '../../@types/engine/MilkyWayInfo';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { MILKY_WAY_INFO } from '../../data/milkyWay/milkyWayInfo';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { DescriptionBlock } from './DescriptionBlock';
import detail from './DetailCard.module.css';
import styles from './MilkyWayDetailCard.module.css';

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
    pinned && detail.pinned,
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

      <div className={styles.topRow}>
        {/* Spiral glyph in place of a thumbnail — we're inside the galaxy. */}
        <div className={styles.glyph} aria-hidden="true">
          🌌
        </div>
        <div className={styles.headlineRow}>
          <div className={styles.cardHeadline}>{target.displayName}</div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <CardRow label="Type" value={target.typeString} />
        <CardRow label="Distance" value={target.distanceNote} />
        <DescriptionBlock text={target.description} />
        <button
          type="button"
          className={styles.flyButton}
          onClick={() => onFocus?.(MILKY_WAY_INFO)}
        >
          Fly here
        </button>
      </div>
    </div>
  );
}
