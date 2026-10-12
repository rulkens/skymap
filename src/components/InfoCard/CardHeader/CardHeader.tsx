/**
 * CardHeader — the whole top of a detail card: eyebrow, the always-present
 * "Pinned" badge (CSS toggles via the outer `.pinned` class), optional Focus +
 * Close buttons, and the name with its optional badge.  Buttons appear iff
 * their callback is passed; callers gate by `pinned` themselves.  Desktop
 * stacks the eyebrow bar over the name; the `phone` layout (the sheet) re-flows the
 * same nodes name-first, in CSS alone, and drops the Pinned badge (the sheet
 * only ever shows the pinned selection).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { CardLayout } from '../../../@types/components/infoCard/CardLayout';
import chrome from '../cardChrome.module.css';
import styles from './CardHeader.module.css';

export type CardHeaderProps = {
  eyebrow: string;
  /** The card's name (plus any trailing aliases). */
  title: ReactNode;
  /** Source / category chip trailing the name. */
  badge?: ReactNode;
  /** `phone`: name first, meta line under it, fixed height, thumbnail left of the name. */
  layout?: CardLayout;
  /** Shown in the `phone` layout only; absent ⇒ no slot. */
  thumbnail?: ReactNode;
  /** When defined, renders the Focus button with this aria-label. */
  onFocus?: () => void;
  focusAriaLabel?: string;
  /** When defined, renders the Close (×) button. */
  onClose?: () => void;
};

function CardHeader({
  eyebrow,
  title,
  badge,
  layout = 'panel',
  thumbnail,
  onFocus,
  focusAriaLabel,
  onClose,
}: CardHeaderProps): ReactNode {
  const phone = layout === 'phone';
  const hasThumbnail = phone && thumbnail != null;
  return (
    <div className={cx(phone && styles.compact, hasThumbnail && styles.withThumbnail)}>
      {hasThumbnail && <div className={styles.thumbnail}>{thumbnail}</div>}
      <div className={styles.bar}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        {!phone && <span className={chrome.pinnedBadge}>Pinned</span>}
        <div className={styles.actions}>
          {onFocus && (
            <button
              type="button"
              className={styles.focus}
              onClick={onFocus}
              aria-label={focusAriaLabel ?? 'Focus camera'}
            >
              Focus
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Clear selection"
              title="Clear selection (Esc)"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className={styles.headlineRow}>
        <div className={styles.headline}>{title}</div>
        {badge != null && <span className={styles.badge}>{badge}</span>}
      </div>
    </div>
  );
}

export default CardHeader;
