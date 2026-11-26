/** StepCountValueContainer — store boundary for the tip's step cell; the only part that re-renders per step. */
import { memo, type ReactNode } from 'react';
import { useAppSelector } from '../../../store/hooks';
import StepCountValue from '../../sim/SimulationTip/StepCountValue/StepCountValue';

function StepCountValueContainer(): ReactNode {
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  return <StepCountValue stepCount={stepCount} />;
}

export default memo(StepCountValueContainer);
