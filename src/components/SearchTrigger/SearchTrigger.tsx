/**
 * SearchTrigger — the always-visible pill that anchors the command-
 * palette UX at the top of the viewport.
 *
 * ### Why this exists
 *
 * The palette opens on Cmd+K / Ctrl+K / `/`.  Discoverable to power
 * users; invisible to first-time visitors.  The trigger pill makes the
 * search affordance discoverable without changing the keyboard
 * shortcut behaviour — both paths converge on the same overlay.
 *
 * ### Why it's not a real <input>
 *
 * Earlier drafts used a real <input> that opened the palette on focus
 * and forwarded keystrokes.  Two problems:
 *
 *   1. Focus juggling — the user types into the trigger, the palette
 *      opens, focus has to jump to the palette's input mid-keystroke,
 *      and the first character can be lost or duplicated depending on
 *      the timing.
 *   2. Two visible inputs in the DOM during the open transition,
 *      which is confusing — "where am I typing?".
 *
 * A button-shaped pill that *looks* like an input but only opens the
 * palette on click sidesteps both.  The user types into the palette's
 * own input, where they expect to.
 *
 * ### Visual identity
 *
 * Same frosted-glass surface vocabulary as InfoCard / SettingsPanel:
 * `--surface-card-soft`, `--border-card`, `--blur-card`, the cosmic
 * blue accent.  ~280 px wide on desktop; on mobile it flex-grows
 * inside the parent `.root` wrapper (TopBarContainer.module.css).  Positioning
 * is owned by that wrapper — the trigger itself no longer carries
 * `position: fixed`.  Hidden behind the palette when it's open so
 * the trigger doesn't peek out behind the modal — `hidden` prop
 * drives the opacity / scale transition.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './SearchTrigger.module.css';

export type SearchTriggerProps = {
  /** Click handler — typically `() => setPaletteOpen(true)` in App.tsx. */
  onClick: () => void;
  /**
   * When true, the trigger fades out and stops accepting clicks.  The
   * palette sets this on its way to opening so the trigger doesn't
   * compete visually with the modal underneath.
   */
  hidden?: boolean;
};

/**
 * Inline magnifying-glass SVG.  No external icon dep — it's nine lines
 * of SVG path that we control completely.  Stroke uses `currentColor`
 * so the icon inherits the trigger's foreground colour and stays in
 * lockstep with hover / focus state changes.
 */
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

// `React.memo` because the trigger has no per-frame data: `onClick` is
// (or should be) a stable reference, `hidden` flips only when the
// command palette opens/closes.  Without memo App's animation re-
// renders would re-render this button (and its inline SVG) every frame.
export default memo(SearchTrigger);
