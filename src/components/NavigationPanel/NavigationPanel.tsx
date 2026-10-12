/**
 * NavigationPanel — keyboard / mouse cheatsheet, static markup in a Panel.
 *
 * Hand-kept in step with `inputBindings.ts`: a shared shortcut registry costs
 * more than editing ~6 rows by hand. Re-evaluate at ~10.
 */

import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import styles from './NavigationPanel.module.css';

/** Desktop only: the phone HUD has no cheatsheet. */
const DESKTOP_ROWS: ReadonlyArray<{ key: string; action: string }> = [
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
      {DESKTOP_ROWS.map((row) => (
        <div className={styles.row} key={row.key}>
          <span className={styles.key}>{row.key}</span>
          <span className={styles.action}>{row.action}</span>
        </div>
      ))}
    </Panel>
  );
}

export default NavigationPanel;
