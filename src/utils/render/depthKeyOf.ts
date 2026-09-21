import type { DepthSampleSource } from '../../@types/engine/frame/DepthSampleSource';

/**
 * depthKeyOf — a `FrameStep.depth` reduced to a string comparable with `===`,
 * so a `{ sample }` step's source id participates in equality: two sampling
 * steps merge only when they name the same source, and a sampling step never
 * merges with a clearing/loading one.
 */
export function depthKeyOf(depth: 'clear' | 'load' | DepthSampleSource | undefined): string {
  if (depth === undefined) return '';
  if (typeof depth === 'string') return depth;
  return `sample:${depth.sample}`;
}
