import type { TimelineAxis } from '../../../@types/exhibits/TimelineAxis';

/** Inverse of `timelineFraction`, for dragging the thumb. */
export function timelineInstant(fraction: number, axis: TimelineAxis): number {
  const { boundsMs } = axis;
  const segments = boundsMs.length - 1;
  const scaled = Math.min(1, Math.max(0, fraction)) * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const from = boundsMs[i]!;
  return from + (scaled - i) * (boundsMs[i + 1]! - from);
}
