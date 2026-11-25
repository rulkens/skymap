/**
 * StatsSummary — the folded Stats header's one line. Its own component so the
 * per-step subscription re-renders this text alone, not the whole sidebar, and
 * only while Stats is folded (PanelSection mounts a summary only then).
 */
import type { ReactNode } from 'react';
import { estimateBoxGpuBytes } from '../../sim/estimateBoxGpuBytes';
import { useAppSelector } from '../../store/hooks';
import { formatStatsSummary } from './utils/formatStatsSummary';

function StatsSummary(): ReactNode {
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  const fps = useAppSelector((s) => s.view.fps);
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);

  return formatStatsSummary(stepCount, fps, estimateBoxGpuBytes(grid, agentCount));
}

export default StatsSummary;
