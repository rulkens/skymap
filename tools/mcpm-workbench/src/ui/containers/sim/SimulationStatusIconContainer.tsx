/**
 * SimulationStatusIconContainer — store boundary for the Simulation section's status
 * icon. It re-renders only when the zone or the run state changes, never per sample.
 */
import { memo, type ReactNode } from 'react';
import { selectSimRunning } from '../../../state/sim/selectSimRunning';
import { useAppSelector } from '../../../store/hooks';
import SimulationStatusIcon from '../../sim/SimulationStatusIcon/SimulationStatusIcon';
import { useFrameRateZone } from './useFrameRateZone';

export type SimulationStatusIconContainerProps = {
  readonly size: number;
};

function SimulationStatusIconContainer({ size }: SimulationStatusIconContainerProps): ReactNode {
  const running = useAppSelector(selectSimRunning);
  const zone = useFrameRateZone();
  return <SimulationStatusIcon size={size} running={running} zone={zone} />;
}

export default memo(SimulationStatusIconContainer);
