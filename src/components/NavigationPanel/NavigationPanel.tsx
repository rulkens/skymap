/**
 * NavigationPanel — keyboard / mouse cheatsheet.
 *
 * ### Why this panel exists
 *
 * The shortcut surface in skymap (Esc, F, H, Cmd-K, drag, wheel) used to be
 * spelled out as a tail on the StatusBar's "ready" string ("…drag to orbit,
 * wheel to zoom").  That worked when there was one shortcut to mention, but
 * as the keymap grew the status bar became cluttered AND the shortcuts users
 * actually wanted to remember (F to focus, H for home, Cmd-K to search) were
 * never advertised.
 *
 * Splitting the cheatsheet out into its own panel lets us:
 *
 *   - List every binding in a stable, scannable place
 *   - Keep the StatusBar focused on engine state (initializing / loading /
 *     error / ready)
 *   - Group it visually with the other left-column overlays (Settings, Stats)
 *
 * The alternative we considered was a hover-only popup on a "?" button.
 * That hides the cheatsheet from new users (who don't know the button exists)
 * and adds an interaction layer for read-only data — not worth it.
 *
 * ### Why no props
 *
 * The cheatsheet is static markup.  Every visible string is hard-coded here;
 * no engine state changes the layout.  If a binding is renamed in App.tsx's
 * keydown handler, this file must be edited by hand to match — there's no
 * indirection right now because the shortcut table is small enough that
 * duplicating it across both files is cheaper than building a shared
 * registry.  Re-evaluate if the table grows past ~10 entries.
 *
 * ### Style duplication with SettingsPanel
 *
 * SettingsPanel and NavigationPanel share the glassmorphic look — same
 * background, blur, border, monospace font, 300px width.  That CSS is
 * duplicated here (in NavigationPanel.module.css) rather than imported from
 * SettingsPanel.module.css.  Cross-importing module CSS classes is awkward
 * with CSS Modules (you'd `composes:` from a different file, which scopes
 * tend to leak), and the duplication is small enough that the clarity wins.
 * If a third panel adopts the same look, refactor into a shared
 * `.panelCard` rule in a sibling stylesheet.
 */

import type { ReactNode } from 'react';
import styles from './NavigationPanel.module.css';

/**
 * The cheatsheet rows, in display order.
 *
 * Two columns: the gesture/key on the left (muted), the action on the right.
 * Kept as a module-level array so the JSX stays a simple `.map`.  Renaming
 * any string here will make the matching test in
 * `tests/components/NavigationPanel/NavigationPanel.test.ts` fail — that's
 * the canary that keeps the cheatsheet in sync with the actual handlers.
 */
const ROWS: ReadonlyArray<{ key: string; action: string }> = [
  { key: 'Drag', action: 'orbit camera' },
  { key: 'Wheel', action: 'zoom' },
  { key: 'H', action: 'home view' },
  { key: 'F', action: 'focus selected' },
  { key: 'Esc', action: 'clear selection' },
  // Three accelerators all map to the same action — list the macOS one
  // first because it's the most commonly hit on dev laptops; the OS-neutral
  // `/` is included as the universal fallback for anyone without a meta key.
  { key: '⌘K / Ctrl+K / /', action: 'search galaxies' },
];

/**
 * Renders the navigation cheatsheet panel.
 *
 * @example
 * // In App.tsx, inside the leftStack wrapper:
 * <NavigationPanel />
 */
export function NavigationPanel(): ReactNode {
  return (
    <div className={styles.navigationPanel}>
      <div className={styles.panelTitle}>NAVIGATION</div>
      <div className={styles.panelContent}>
        {ROWS.map((row) => (
          <div className={styles.row} key={row.key}>
            <span className={styles.key}>{row.key}</span>
            <span className={styles.action}>{row.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
