/**
 * SimulationStatusIcon — the Simulation section's icon as a status cue: its arrow
 * turns while the sim runs and it warns on a low frame rate. It selects the zone,
 * not the rate, so it re-renders only when the zone or the run state changes.
 * Paused, it takes the section's own (dimmed) colour.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { FrameRateZone } from '../../../@types/FrameRateZone';
import { useAppSelector } from '../../store/hooks';
import LoopPlayIcon from '../icons/LoopPlayIcon/LoopPlayIcon';
import { frameRateZone } from './utils/frameRateZone';
import styles from './SimulationStatusIcon.module.css';

type Props = {
  readonly size: number;
};

function SimulationStatusIcon({ size }: Props): ReactNode {
  // The zone on screen, which the next rate is judged against for the hysteresis.
  const shown = useRef<FrameRateZone>('normal');
  const running = useAppSelector((s) => s.sim.running);
  const zone = useAppSelector((s) => frameRateZone(shown.current, s.view.fps, s.sim.running));
  useEffect(() => {
    shown.current = zone;
  }, [zone]);

  return (
    <span className={styles.root} data-zone={zone} data-running={running || undefined}>
      <LoopPlayIcon size={size} loopClassName={styles.loop} />
    </span>
  );
}

export default SimulationStatusIcon;
