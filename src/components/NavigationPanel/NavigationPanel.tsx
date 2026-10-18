/**
 * NavigationPanel — keyboard / mouse cheatsheet, static markup in a Panel.
 *
 * Hand-kept in step with `KEYBOARD_SHORTCUTS` (`src/state/input/keyboardShortcuts.ts`)
 * and `CONTROL_BINDINGS` (`src/data/input/controlBindings.ts`): a shared shortcut registry costs
 * more than editing ~6 rows by hand. Re-evaluate at ~10.
 */

import { memo, type ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import styles from './NavigationPanel.module.css';

const ROWS: ReadonlyArray<{ key: string; action: string }> = [
  { key: 'Drag', action: 'orbit camera' },
  { key: 'Wheel', action: 'zoom' },
  { key: 'H', action: 'home view' },
  { key: 'F', action: 'focus selected' },
  { key: 'Esc', action: 'clear selection' },
  // `/` is the fallback for keyboards without a meta key.
  { key: '⌘K / Ctrl+K / /', action: 'search galaxies' },
];

function NavigationPanel(): ReactNode {
  return (
    <Panel title="NAVIGATION" ariaLabel="Navigation cheatsheet">
      {ROWS.map((row) => (
        <div className={styles.row} key={row.key}>
          <span className={styles.key}>{row.key}</span>
          <span className={styles.action}>{row.action}</span>
        </div>
      ))}
    </Panel>
  );
}

export default memo(NavigationPanel);
