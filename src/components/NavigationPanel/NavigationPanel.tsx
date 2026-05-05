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
 * ### Collapse affordance
 *
 * The header is a clickable <button> that folds the body away — same chevron
 * + uppercase title pattern as SettingsPanel's outer collapse.  State is
 * persisted to `localStorage` under `skymap.navigation.open` so a user's
 * choice survives a reload (independent of the analogous keys for the
 * SettingsPanel and StatsPanel).  Default OPEN so a first-time visitor sees
 * the cheatsheet immediately; once they know it exists they can fold it
 * away to reclaim the corner.
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

import { useEffect, useState, type ReactNode } from 'react';
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
 * localStorage key for this panel's open/closed state.
 *
 * The `skymap.` prefix namespaces the key so it doesn't collide with anything
 * else the page (or a future host page) might write.  The middle segment
 * names the panel; the trailing `.open` is a per-feature suffix so the
 * panel could grow other persisted bits (`.position`, `.collapsed`,
 * `.something-else`) without rewriting existing keys.
 */
const STORAGE_KEY = 'skymap.navigation.open';

/**
 * Read the persisted open/closed state.
 *
 * Mirrors `readSectionOpen` in `CollapsibleSection.tsx`, but inlined here
 * because the helper is short and there are only two consumers (this panel
 * and StatsPanel).  See CLAUDE.md guidance — < 30 lines = inline; only
 * factor out when the third consumer arrives.
 *
 * Why each branch:
 *   - `typeof window === 'undefined'`: SSR safety.  We don't server-render
 *     today, but the guard is cheap and keeps the function usable in an
 *     SSR context — and prevents Vitest's node-env tests from crashing
 *     when no shim is installed.
 *   - try/catch around getItem: Safari private mode (and a few corporate
 *     environments) throw on `localStorage` access.  We swallow the error
 *     and fall back to `defaultOpen` rather than break the UI.
 *   - `v === '1'`: persisted format is the smallest possible — a single
 *     character.  Any unrecognised value falls through to false (closed),
 *     which is the safer default for "I don't know what this means".
 */
function readPanelOpen(defaultOpen: boolean): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? defaultOpen : v === '1';
  } catch {
    return defaultOpen;
  }
}

/**
 * Write the open/closed state.  Swallows errors silently — Safari private
 * mode (and a few corporate environments) throw `QuotaExceededError` from
 * `setItem` even when reading is allowed.  The panel still works; the
 * choice just doesn't survive a reload.
 */
function writePanelOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Intentionally empty — see docblock.
  }
}

/**
 * Renders the navigation cheatsheet panel.
 *
 * @example
 * // In App.tsx, inside the leftStack wrapper:
 * <NavigationPanel />
 */
export function NavigationPanel(): ReactNode {
  // Lazy initializer — read localStorage exactly once at mount, not on
  // every re-render.  Default OPEN so a first-time visitor sees the
  // cheatsheet without having to discover it.
  const [open, setOpen] = useState<boolean>(() => readPanelOpen(true));

  // Persist on every change.  Splitting writes into an effect (rather
  // than calling `writePanelOpen` inline in the click handler) means
  // any external `setOpen` would also persist — robust to future
  // refactors that toggle from elsewhere.
  useEffect(() => {
    writePanelOpen(open);
  }, [open]);

  return (
    <div className={styles.navigationPanel} aria-label="Navigation cheatsheet">
      {/*
        Title doubles as the click target for collapse/expand — same pattern
        as SettingsPanel's outer collapse.  Using a real <button> rather
        than a styled <div> gives us keyboard focus + Enter/Space activation
        + `aria-expanded` for screen readers without a custom onKeyDown.
        The CSS strips default <button> chrome so the row reads as a plain
        heading; only the cursor + focus ring announce its interactivity.
      */}
      <button
        type="button"
        className={styles.panelTitleButton}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="navigation-panel-body"
      >
        {/*
          Chevron sits LEFT of the heading like a tree-twirl / list-marker.
          Two glyphs (▸ closed, ▾ open) instead of a CSS rotation because
          the parent panel doesn't yet have rotation animation — keeping
          the markup minimal and matching SettingsPanel's outer collapse.
        */}
        <span className={styles.panelTitleChevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className={styles.panelTitle}>NAVIGATION</span>
      </button>

      {/*
        Body — conditionally rendered rather than CSS-hidden, matching
        SettingsPanel's outer collapse.  The cheatsheet's row count is
        small but we still avoid keeping ~6 spans in the DOM when collapsed
        (consistency with the parent affordance matters more than the
        marginal DOM cost).  The `id` lets `aria-controls` on the title
        button point at a real element.
      */}
      {open && (
        <div id="navigation-panel-body" className={styles.panelContent}>
          {ROWS.map((row) => (
            <div className={styles.row} key={row.key}>
              <span className={styles.key}>{row.key}</span>
              <span className={styles.action}>{row.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
