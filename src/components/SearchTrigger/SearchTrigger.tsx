/**
 * SearchTrigger — the always-visible pill that makes the command palette
 * (Cmd/Ctrl+K, `/`) discoverable. Desktop only; the phone dock carries search.
 *
 * A button that looks like an input, not a real <input>: a real one opened the
 * palette on focus and had to hand focus over mid-keystroke, losing or
 * duplicating the first character and showing two inputs during the transition.
 * `hidden` fades it out behind the modal.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './SearchTrigger.module.css';

export type SearchTriggerProps = {
  onClick: () => void;
  /** Fades out and stops accepting clicks while the palette is open. */
  hidden?: boolean;
};

// `currentColor` so the icon follows the trigger's hover / focus colour.
function SearchIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="10.5"
        y1="10.5"
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchTrigger({ onClick, hidden = false }: SearchTriggerProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.trigger, hidden && styles.hidden)}
      onClick={onClick}
      aria-label="Search galaxies, stars, planets, and clusters"
      aria-hidden={hidden || undefined}
      aria-keyshortcuts="Meta+K Control+K /"
    >
      <SearchIcon />
      <span className={styles.placeholder}>Search the universe…</span>
      <span className={styles.shortcut} aria-hidden="true">
        ⌘K
      </span>
    </button>
  );
}

// memo: `onClick` is stable and `hidden` flips only on palette open/close, so
// App's frequent re-renders shouldn't reach this button.
export default memo(SearchTrigger);
