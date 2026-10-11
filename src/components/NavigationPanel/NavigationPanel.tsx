/**
 * NavigationPanel — keyboard / mouse cheatsheet.
 *
 * ### Why this panel exists
 *
 * The shortcut surface in skymap (Esc, F, H, Cmd-K, drag, wheel) used to be
 * spelled out as a tail on the StatusBar's "ready" string.  That worked for
 * one shortcut, but as the keymap grew the status bar got cluttered AND the
 * shortcuts users actually wanted to remember (F to focus, H for home,
 * Cmd-K to search) were never advertised.  Splitting the cheatsheet out into
 * its own panel lets us list every binding in a stable, scannable place
 * while the StatusBar stays focused on engine state.
 *
 * ### Why no props
 *
 * The cheatsheet is static markup.  Every visible string is hard-coded here;
 * no engine state changes the layout.  If a binding is renamed in
 * `App.tsx`'s keydown handler, this file must be edited by hand to match —
 * the duplication is cheaper than building a shared shortcut registry while
 * the table stays small (~6 entries).  Re-evaluate at ~10.
 *
 * ### Chrome and collapse via Panel
 *
 * The glassmorphic card + clickable uppercase title row + body reveal
 * affordance live in the shared `Panel` component (see
 * `components/common/Panel`).  This module just supplies the cheatsheet
 * rows; collapse state is session-only and lives inside Panel.
 */

import { memo, type ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import styles from './NavigationPanel.module.css';

/**
 * Cheatsheet rows, in display order.  Two columns: gesture/key on the left
 * (muted), action on the right.  Module-level constants so the JSX stays a
 * simple `.map`.  Renaming any string here breaks the matching test in
 * `tests/components/NavigationPanel/NavigationPanel.test.ts` — that's the
 * canary that keeps the cheatsheet in sync with the actual handlers.
 *
 * Desktop only: the phone HUD has no cheatsheet.
 */
const DESKTOP_ROWS: ReadonlyArray<{ key: string; action: string }> = [
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

export type NavigationPanelProps = {
  defaultOpen?: boolean;
};

function NavigationPanel(props: NavigationPanelProps): ReactNode {
  // Non-optional `props` parameter (no `= {}` default) so React's
  // createElement TS overloads match the function-component signature
  // and thread `NavigationPanelProps` through.  With a defaulted
  // parameter, TS picks the no-args overload and rejects callers that
  // try to pass `{ defaultOpen: true }` with a confusing
  // "Type 'X' has no properties in common with type 'Attributes'".
  // Callers that don't need any prop pass an explicit empty `{}`.
  const { defaultOpen } = props;
  return (
    <Panel title="NAVIGATION" ariaLabel="Navigation cheatsheet" defaultOpen={defaultOpen}>
      {DESKTOP_ROWS.map((row) => (
        <div className={styles.row} key={row.key}>
          <span className={styles.key}>{row.key}</span>
          <span className={styles.action}>{row.action}</span>
        </div>
      ))}
    </Panel>
  );
}

// `React.memo` because every prop is a primitive — the panel content is
// fully static after the first render, but App.tsx re-renders on every
// camera update during animation.  Without memo the cheatsheet
// would re-run its row-mapping for nothing.  Shallow compare on two
// booleans is essentially free.
export default memo(NavigationPanel);
