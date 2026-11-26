/** StatsSummary — the folded Stats header's one line: step, frame rate and GPU memory. */
import type { ReactNode } from 'react';
import { formatStatsSummary } from './utils/formatStatsSummary';

export type StatsSummaryProps = {
  readonly stepCount: number;
  readonly fps: number;
  readonly gpuBytes: number;
};

function StatsSummary({ stepCount, fps, gpuBytes }: StatsSummaryProps): ReactNode {
  return formatStatsSummary(stepCount, fps, gpuBytes);
}

export default StatsSummary;
