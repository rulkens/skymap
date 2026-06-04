/**
 * Hud — the corner readout: what you're looking at + the live particle count.
 *
 * Minimal and non-interactive (pointer-events: none). The count tracks the
 * active flow mode's `count` param so it reflects the slider live.
 */
import type { ReactNode } from 'react';
import { useStore } from '../../state/useStore';
import { selectActiveFlowParams } from '../../state/selectors';
import { useAppStore } from '../storeContext';
import styles from './Hud.module.css';

function Hud(): ReactNode {
  const store = useAppStore();
  const count = useStore(store, (s) => selectActiveFlowParams(s).count);
  return (
    <div className={styles.hud}>
      CF4++ peculiar-velocity flow · <b>{Math.round(count).toLocaleString()}</b> particles · real
      128³ supergalactic grid
    </div>
  );
}

export default Hud;
