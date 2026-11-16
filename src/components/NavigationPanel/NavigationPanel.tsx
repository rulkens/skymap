/**
 * NavigationPanel — keyboard / mouse cheatsheet, static markup in a Panel, one row set per mode:
 * standing on the ground turns the same gestures into looking around.
 *
 * Hand-kept in step with `KEYBOARD_SHORTCUTS` (`src/state/input/keyboardShortcuts.ts`)
 * and `CONTROL_BINDINGS` (`src/data/input/controlBindings.ts`): a shared shortcut registry costs
 * more than editing ~6 rows by hand. Re-evaluate at ~10.
 */

import { memo, type ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import styles from './NavigationPanel.module.css';

export type NavigationPanelProps = {
  readonly mode: 'space' | 'sky';
};

const ROWS_BY_MODE: Readonly<
  Record<NavigationPanelProps['mode'], ReadonlyArray<{ key: string; action: string }>>
> = {
  space: [
    { key: 'Drag', action: 'orbit camera' },
    { key: 'Wheel', action: 'zoom' },
    { key: 'H', action: 'home view' },
    { key: 'F', action: 'focus selected' },
    { key: 'Esc', action: 'close card, then clear' },
    // `/` is the fallback for keyboards without a meta key.
    { key: '⌘K / Ctrl+K / /', action: 'search galaxies' },
  ],
  sky: [
    { key: 'Drag', action: 'look around' },
    { key: 'Wheel', action: 'field of view' },
    { key: 'Wheel out at 120°', action: 'lift off' },
    { key: 'Esc', action: 'close card, then leave' },
  ],
};

function NavigationPanel({ mode }: NavigationPanelProps): ReactNode {
  return (
    <Panel title={mode === 'sky' ? 'SKY MODE' : 'NAVIGATION'} ariaLabel="Navigation cheatsheet">
      {ROWS_BY_MODE[mode].map((row) => (
        <div className={styles.row} key={row.key}>
          <span className={styles.key}>{row.key}</span>
          <span className={styles.action}>{row.action}</span>
        </div>
      ))}
    </Panel>
  );
}

export default memo(NavigationPanel);
