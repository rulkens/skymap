/**
 * SimulationStatusIcon — the Simulation section's icon as a status cue: its arrow
 * turns while the sim runs and its colour follows the frame-rate zone. Paused, it
 * takes the section's own (dimmed) colour.
 */
import type { ReactNode } from 'react';
import type { FrameRateZone } from '../../../../@types/sim/FrameRateZone';
import LoopPlayIcon from '../../../../../../src/components/icons/LoopPlayIcon/LoopPlayIcon';
import styles from './SimulationStatusIcon.module.css';

export type SimulationStatusIconProps = {
  readonly size: number;
  readonly running: boolean;
  readonly zone: FrameRateZone;
};

function SimulationStatusIcon({ size, running, zone }: SimulationStatusIconProps): ReactNode {
  return (
    <span className={styles.root} data-zone={zone} data-running={running || undefined}>
      <LoopPlayIcon size={size} loopClassName={styles.loop} />
    </span>
  );
}

export default SimulationStatusIcon;
