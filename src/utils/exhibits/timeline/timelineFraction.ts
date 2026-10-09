import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';

/** Track position in [0, 1] of an instant; clamped at both ends. Monotone, segments equal-width. */
export function timelineFraction(ms: number, axis: TimelineAxis): number {
  const { boundsMs } = axis;
  const segments = boundsMs.length - 1;
  for (let i = 0; i < segments; i++) {
    const to = boundsMs[i + 1]!;
    if (ms < to || i === segments - 1) {
      const from = boundsMs[i]!;
      const within = Math.min(1, Math.max(0, (ms - from) / (to - from)));
      return (i + within) / segments;
    }
  }
  return 0;
}
