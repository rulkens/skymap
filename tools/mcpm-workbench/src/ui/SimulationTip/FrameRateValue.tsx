/** FrameRateValue — the tip's frame-rate cell, in the icon's zone colour; re-renders per fps sample, alone. */
import type { ReactNode } from 'react';
import { selectSimRunning } from '../../state/sim/selectSimRunning';
import { useAppSelector } from '../../store/hooks';
import { formatFps } from '../formatFps';
import { useFrameRateZone } from '../SimulationStatusIcon/useFrameRateZone';
import styles from './SimulationTip.module.css';

function FrameRateValue(): ReactNode {
  const zone = useFrameRateZone();
  const text = useAppSelector((s) =>
    !selectSimRunning(s) ? 'paused' : s.view.fps > 0 ? formatFps(s.view.fps) : '—',
  );
  return (
    <span className={styles.value} data-zone={zone}>
      {text}
    </span>
  );
}

export default FrameRateValue;
