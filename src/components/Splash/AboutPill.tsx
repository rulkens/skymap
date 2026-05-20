/**
 * AboutPill — 40 × 40 frosted-glass pill that reopens the splash
 * dialog.  Sits in the top-bar flex row (`.topBar` in App.module.css)
 * alongside SearchTrigger and AutoRotateToggle.
 *
 * ### Why a dedicated pill rather than a SettingsPanel link
 *
 * Per the 2026-05-20 grill (Q10), the About affordance needs to be
 * discoverable to deep-link arrivals who skipped the splash and to
 * returning visitors who want to re-read the intro.  Burying it in
 * the Settings panel (the most-frequently-collapsed surface on
 * mobile) defeats both audiences.  A top-bar pill is canonical
 * "help / about" placement and matches the user's chosen layout
 * (Search · AutoRotate · About).
 *
 * ### Why React.memo
 *
 * Reads only `onClick`, `hidden` — neither changes per frame.  Without
 * memo, App's animation re-renders would re-render the inline SVG
 * every frame.  Same rationale as SearchTrigger / AutoRotateToggle.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './AboutPill.module.css';

export type AboutPillProps = {
  /** Called when the user clicks/activates the pill — reopens splash. */
  onClick: () => void;
  /**
   * When true, the pill fades out and stops accepting clicks — matches
   * SearchTrigger and AutoRotateToggle's `hidden` semantics so the
   * three pills coordinate during palette-open and splash-visible
   * transitions.
   */
  hidden?: boolean;
};

/** Inline circled-? glyph — nine lines of SVG we own end-to-end. */
function InfoIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 6 Q6.5 4.5 8 4.5 Q9.5 4.5 9.5 6 Q9.5 7 8 7.5 L8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.25" r="0.85" fill="currentColor" />
    </svg>
  );
}

function AboutPill({ onClick, hidden = false }: AboutPillProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.pill, hidden && styles.hidden)}
      onClick={onClick}
      aria-label="About skymap"
      aria-hidden={hidden || undefined}
    >
      <InfoIcon />
    </button>
  );
}

export default memo(AboutPill);
