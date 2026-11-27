/**
 * StatsReadoutContainer — store boundary for the Stats readout: the load's counts,
 * the run's step and frame rate, and the GPU memory of the box as set.
 */
import { memo, type ReactNode } from 'react';
import { estimateBoxGpuBytes } from '../../../sim/memory/estimateBoxGpuBytes';
import { useAppSelector } from '../../../store/hooks';
import StatsReadout from '../../sim/StatsReadout/StatsReadout';

function StatsReadoutContainer(): ReactNode {
  const pointCount = useAppSelector((s) => s.catalog.pointCount);
  const nanFillCount = useAppSelector((s) => s.catalog.nanFillCount);
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  const fps = useAppSelector((s) => s.view.fps);
  return (
    <StatsReadout
      pointCount={pointCount}
      nanFillCount={nanFillCount}
      stepCount={stepCount}
      fps={fps}
      gpuBytes={estimateBoxGpuBytes(grid, agentCount, pointCount)}
      maxBufferBytes={grid.maxBufferBytes}
    />
  );
}

export default memo(StatsReadoutContainer);
