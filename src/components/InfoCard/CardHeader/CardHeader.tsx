/**
 * CardHeader — the whole top of a detail card: eyebrow, the always-present
 * "Pinned" badge (CSS toggles via the outer `.pinned` class), optional Focus +
 * Close buttons, and the name with its optional badge.  Buttons appear iff
 * their callback is passed; callers gate by `pinned` themselves.  Desktop
 * stacks the eyebrow bar over the name; the chromeless phone sheet re-flows the
 * same nodes name-first, in CSS alone.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import chrome from '../cardChrome.module.css';
import styles from './CardHeader.module.css';

export type CardHeaderProps = {
  eyebrow: string;
  /** The card's name (plus any trailing aliases). */
  title: ReactNode;
  /** Source / category chip trailing the name. */
  badge?: ReactNode;
  /** Phone-sheet image left of the name; absent ⇒ no slot. */
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
  thumbnail,
  onFocus,
  focusAriaLabel,
  onClose,
}: CardHeaderProps): ReactNode {
  return (
    <div className={cx(styles.root, thumbnail != null && styles.withThumbnail)}>
      {thumbnail != null && <div className={chrome.headerThumbnail}>{thumbnail}</div>}
      <div className={styles.bar}>
        <span className={chrome.headerEyebrow}>{eyebrow}</span>
        <span className={chrome.pinnedBadge}>Pinned</span>
        <div className={chrome.headerActions}>
          {onFocus && (
            <button
              type="button"
              className={chrome.focusButton}
              onClick={onFocus}
              aria-label={focusAriaLabel ?? 'Focus camera'}
            >
              Focus
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className={chrome.closeButton}
              onClick={onClose}
              aria-label="Clear selection"
              title="Clear selection (Esc)"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className={chrome.headlineRow}>
        <div className={chrome.cardHeadline}>{title}</div>
        {badge != null && <span className={chrome.sourceBadge}>{badge}</span>}
      </div>
    </div>
  );
}

export default CardHeader;
