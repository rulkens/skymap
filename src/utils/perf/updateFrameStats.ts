/**
 * updateFrameStats — fold one measured frame into the rolling CPU-side
 * FPS + JS-frame-time readout that the DebugPanel shows at all times.
 *
 * This is the pure core behind the always-on panel line: given the previous
 * smoothed `{ fps, cpuMs }` and a fresh `{ intervalMs, cpuMs }` sample, return
 * the next smoothed pair.  Both channels are exponential moving averages, which
 * cost O(1) memory (no ring buffer) and react quickly enough for a 4 Hz readout.
 *
 * ### Why the idle-gap guard on fps (not cpuMs)
 *
 * The engine renders on demand — the rAF loop sleeps whenever nothing animates.
 * When it wakes, the FIRST frame's interval since the last measured frame can be
 * arbitrarily large (hundreds of ms, or the whole idle span).  `1000/interval`
 * for that frame is a tiny number; folding it into the fps EMA would tank the
 * average and make the panel read a garbage low fps right after every wake.
 *
 * So fps folds ONLY when the interval is a plausible real frame gap:
 * `0 < intervalMs <= IDLE_GAP_MS`.  A zero interval (the very first frame, before
 * `lastStartMs` is seeded) is also skipped — folding `1000/0 = Infinity` would
 * poison the EMA and there's no div-by-zero to reason about.  `cpuMs` has no such
 * hazard: the JS-body duration of a wake frame is a perfectly valid sample, so it
 * always folds.
 */

// Smoothing factor for both EMAs. 0.1 keeps ~10 frames of memory — smooth enough
// to read steadily, responsive enough to reflect a settings flip within ~150 ms.
const EMA_ALPHA = 0.1;

/**
 * Intervals longer than this (ms) are treated as an idle gap / wake frame and
 * excluded from the fps EMA. 100 ms is well past a real 60 fps frame (16.7 ms)
 * or even a stuttering 15 fps one (66 ms), so honest slow frames still count,
 * but a render-on-demand wake never does.
 */
export const IDLE_GAP_MS = 100;

const ema = (prev: number, sample: number): number => prev + EMA_ALPHA * (sample - prev);

export function updateFrameStats(
  prev: { fps: number; cpuMs: number },
  sample: { intervalMs: number; cpuMs: number },
): { fps: number; cpuMs: number } {
  const cpuMs = ema(prev.cpuMs, sample.cpuMs);
  const foldFps = sample.intervalMs > 0 && sample.intervalMs <= IDLE_GAP_MS;
  const fps = foldFps ? ema(prev.fps, 1000 / sample.intervalMs) : prev.fps;
  return { fps, cpuMs };
}
