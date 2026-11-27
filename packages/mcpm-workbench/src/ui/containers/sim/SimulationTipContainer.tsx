/** SimulationTipContainer — store boundary for the Simulation icon's tip: the grid and the agent count. */
import { memo, type ReactNode } from 'react';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import { useAppSelector } from '../../../store/hooks';
import SimulationTip from '../../sim/SimulationTip/SimulationTip';

function SimulationTipContainer(): ReactNode {
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  return <SimulationTip gridDims={deriveGridBox(grid).dims} agentCount={agentCount} />;
}

export default memo(SimulationTipContainer);
