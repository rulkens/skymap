/**
 * StatsSummaryContainer — store boundary for the folded Stats header's line. Its own
 * component so the per-step subscription re-renders this text alone, not the whole
 * sidebar, and only while Stats is folded (PanelSection mounts a summary only then).
 */
import { memo, type ReactNode } from 'react';
import { estimateBoxGpuBytes } from '../../../sim/memory/estimateBoxGpuBytes';
import { useAppSelector } from '../../../store/hooks';
import StatsSummary from '../../sim/StatsSummary/StatsSummary';

function StatsSummaryContainer(): ReactNode {
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  const fps = useAppSelector((s) => s.view.fps);
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const pointCount = useAppSelector((s) => s.catalog.pointCount);
  return (
    <StatsSummary
      stepCount={stepCount}
      fps={fps}
      gpuBytes={estimateBoxGpuBytes(grid, agentCount, pointCount)}
    />
  );
}

export default memo(StatsSummaryContainer);
