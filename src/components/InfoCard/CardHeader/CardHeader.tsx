/**
 * CardHeader — shared title row for detail cards.  Renders the eyebrow,
 * the always-present "Pinned" badge (CSS toggles via the outer `.pinned`
 * class), and an optional Focus button + Close button.  Buttons appear
 * iff their callback is passed; callers gate by `pinned` themselves.
 */

import type { ReactNode } from 'react';
import chrome from '../cardChrome.module.css';
import styles from './CardHeader.module.css';

export type CardHeaderProps = {
  eyebrow: string;
  /** When defined, renders the Focus button with this aria-label. */
  onFocus?: () => void;
  focusAriaLabel?: string;
  /** When defined, renders the Close (×) button. */
  onClose?: () => void;
};

function CardHeader({ eyebrow, onFocus, focusAriaLabel, onClose }: CardHeaderProps): ReactNode {
  return (
    <div className={styles.root}>
      <span>{eyebrow}</span>
      <span className={chrome.pinnedBadge}>Pinned</span>
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
  );
}

export default CardHeader;
