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
import SearchIcon from '../icons/SearchIcon/SearchIcon';
import styles from './SearchTrigger.module.css';

export type SearchTriggerProps = {
  onClick: () => void;
  /** Fades out and stops accepting clicks while the palette is open. */
  hidden?: boolean;
};

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
      <SearchIcon size={14} />
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
