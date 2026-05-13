/**
 * AutoRotateToggle — a 40 × 40 px frosted-glass play/pause button
 * rendered next to the SearchTrigger pill at top-center.  Toggles the
 * engine's `autoRotate` setting; one click instead of three (open
 * settings → scroll → tick checkbox).
 *
 * ### Visual identity
 *
 * Same surface vocabulary as SearchTrigger / InfoCard:
 * `--surface-card-soft`, `--border-card`, `--blur-card`,
 * `--shadow-card`.  Hover/focus shift to `--surface-card-strong` +
 * `--border-hover`, the icon tints to `--color-accent`.
 *
 * ### Why React.memo
 *
 * The toggle reads only `playing`, `onToggle`, `hidden` — none of
 * which change per frame.  Without memo, App's animation re-renders
 * would re-render the inline SVG every frame.  Same reasoning as
 * SearchTrigger.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './AutoRotateToggle.module.css';

export type AutoRotateToggleProps = {
  /** Current autoRotate state. Drives which icon is shown. */
  playing: boolean;
  /** Called when the user clicks the toggle. */
  onToggle: () => void;
  /**
   * When true, the toggle fades out and stops accepting clicks —
   * matches SearchTrigger's `hidden` semantics during the open-
   * palette transition.
   */
  hidden?: boolean;
};

function PlayIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      data-testid="play-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 3 L13 8 L4 13 Z" fill="currentColor" />
    </svg>
  );
}

function AutoRotateToggle({ playing, onToggle, hidden = false }: AutoRotateToggleProps): ReactNode {
  const label = playing ? 'Pause camera auto-rotate' : 'Start camera auto-rotate';
  return (
    <button
      type="button"
      className={cx(styles.toggle, hidden && styles.hidden)}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={playing}
      aria-hidden={hidden || undefined}
    >
      <PlayIcon />
    </button>
  );
}

export default memo(AutoRotateToggle);
