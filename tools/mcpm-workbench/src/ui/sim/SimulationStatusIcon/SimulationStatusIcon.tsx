/**
 * SimulationStatusIcon — the Simulation section's icon as a status cue: its arrow
 * turns while the sim runs and its colour follows the frame-rate zone. It
 * re-renders only when the zone or the run state changes, never per sample.
 * Paused, it takes the section's own (dimmed) colour.
 */
import type { ReactNode } from 'react';
import { selectSimRunning } from '../../../state/sim/selectSimRunning';
import { useAppSelector } from '../../../store/hooks';
import LoopPlayIcon from '../../icons/LoopPlayIcon/LoopPlayIcon';
import { useFrameRateZone } from './useFrameRateZone';
import styles from './SimulationStatusIcon.module.css';

type SimulationStatusIconProps = {
  readonly size: number;
};

function SimulationStatusIcon({ size }: SimulationStatusIconProps): ReactNode {
  const running = useAppSelector(selectSimRunning);
  const zone = useFrameRateZone();

  return (
    <span className={styles.root} data-zone={zone} data-running={running || undefined}>
      <LoopPlayIcon size={size} loopClassName={styles.loop} />
    </span>
  );
}

export default SimulationStatusIcon;
