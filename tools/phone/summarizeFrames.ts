import type { FrameSummary } from './@types/FrameSummary';
import type { TraceEvent } from './@types/TraceEvent';

const MIN_FRAMES = 3;

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? NaN;
}

/**
 * Frames as the app's own rAF callbacks (`FireAnimationFrame`, complete `X`
 * events of `devtools.timeline`) on the thread that ran the most of them: a
 * browser-wide trace also holds other tabs. Undefined when there are too few
 * to say anything. The engine renders on demand, so on a still scene the
 * intervals measure idleness; the callback durations hold either way.
 */
export function summarizeFrames(events: readonly TraceEvent[]): FrameSummary | undefined {
  const byThread = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.name !== 'FireAnimationFrame' || e.ph !== 'X') continue;
    const key = `${e.pid}:${e.tid}`;
    byThread.set(key, [...(byThread.get(key) ?? []), e]);
  }
  const frames = [...byThread.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  if (frames.length < MIN_FRAMES) return undefined;
  frames.sort((a, b) => a.ts - b.ts);
  const intervals = frames
    .slice(1)
    .map((e, i) => (e.ts - (frames[i] as TraceEvent).ts) / 1000)
    .sort((a, b) => a - b);
  const callbacks = frames.map((e) => (e.dur ?? 0) / 1000).sort((a, b) => a - b);
  const last = frames[frames.length - 1] as TraceEvent;
  return {
    frames: frames.length,
    spanMs: (last.ts - (frames[0] as TraceEvent).ts) / 1000,
    intervalMedianMs: percentile(intervals, 0.5),
    intervalP95Ms: percentile(intervals, 0.95),
    callbackMedianMs: percentile(callbacks, 0.5),
    callbackP95Ms: percentile(callbacks, 0.95),
  };
}
