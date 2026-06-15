/**
 * ModeTabs — picks the flow integration mode (advect vs streamline).
 *
 * This is a flowSlice PARAMETER, not a layer toggle: there's always exactly one
 * active mode, so it reads as a two-tab segmented control rather than on/off
 * switches. Presentational: `mode` highlights the active tab, `onSelect` fires
 * the choice. Each tab is a shared Button (primary when active, ghost when not).
 */
import type { ReactNode } from 'react';
import type { FlowMode } from '../../../../../src/@types/data/flow/FlowMode';
import Button from '../../../../../src/components/common/Button/Button';
import styles from './ModeTabs.module.css';

export type ModeTabsProps = {
  readonly mode: FlowMode;
  readonly onSelect: (mode: FlowMode) => void;
};

const MODES: readonly FlowMode[] = ['advect', 'streamline'];

function ModeTabs({ mode, onSelect }: ModeTabsProps): ReactNode {
  return (
    <div className={styles.tabs}>
      {MODES.map((m) => (
        <Button
          key={m}
          variant={m === mode ? 'primary' : 'ghost'}
          aria-pressed={m === mode}
          onClick={() => onSelect(m)}
          className={styles.tab}
        >
          {m}
        </Button>
      ))}
    </div>
  );
}

export default ModeTabs;
