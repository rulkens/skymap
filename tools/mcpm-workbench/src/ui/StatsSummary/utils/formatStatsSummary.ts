import { formatBytes } from '../../formatBytes';

/** formatStatsSummary — step, frame rate and GPU memory; a frame rate of 0 is not measured yet. */
export function formatStatsSummary(stepCount: number, fps: number, gpuBytes: number): string {
  const parts = [`step ${stepCount.toLocaleString()}`];
  if (fps > 0) parts.push(`${fps} fps`);
  parts.push(formatBytes(gpuBytes));
  return parts.join(' · ');
}
