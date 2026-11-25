import { formatBytes } from '../../../../utils/format/formatBytes';
import { formatFps } from '../../../../utils/format/formatFps';

/** formatStatsSummary — step, frame rate and GPU memory; a frame rate of 0 is not measured yet. */
export function formatStatsSummary(stepCount: number, fps: number, gpuBytes: number): string {
  const parts = [`step ${stepCount.toLocaleString()}`];
  if (fps > 0) parts.push(formatFps(fps));
  parts.push(formatBytes(gpuBytes));
  return parts.join(' · ');
}
