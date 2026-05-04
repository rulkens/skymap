/**
 * fpsCounter — rolling-window FPS estimator for the engine's per-frame loop.
 *
 * ### Why a rolling window (not instantaneous 1/dt)?
 *
 * Instantaneous FPS — derived from a single inter-frame delta — is
 * spectacularly noisy.  At 60 Hz the browser routinely jitters individual
 * dt's between 12 ms and 24 ms (GC pauses, compositor stalls, OS
 * preemption), which would translate to a status-bar number bouncing
 * between 42 and 83 every frame even though the *perceived* framerate is
 * a rock-steady 60.  A rolling mean over the last N frames smooths this
 * jitter to something the human eye can read while still reacting to
 * sustained perf changes within ~1 second at 60 Hz.
 *
 * ### Why not exponentially-weighted moving average?
 *
 * EMA is cheaper (no ring buffer) but harder to reason about: a sudden
 * 3× slowdown would only halfway-decay into the displayed number after
 * `1/(1-α)` frames, and there's no clean "the last N frames" semantic
 * for the user to anchor on.  The plain window is O(N) per frame on
 * `mean()` but at N=60 that's 60 floating-point adds per frame — utterly
 * negligible against the 3.5 M-galaxy main loop.
 *
 * ### Window size choice (60)
 *
 * One second at the renderer's design framerate.  Long enough to absorb
 * jitter, short enough to react to genuine slowdowns (e.g. the bug we're
 * trying to diagnose: framerate halving "until you toggle thumbnails off
 * and on").  At 30 fps the window covers two seconds, which is still
 * fine — perf-investigation timescales are minutes, not sub-second.
 */

export type FpsCounter = {
  /**
   * Record one frame's wall-clock timestamp (`performance.now()` in ms).
   * Returns the latest integer FPS estimate, or `null` if the buffer
   * doesn't yet hold at least two timestamps (FPS undefined from a
   * single sample).
   */
  sample(nowMs: number): number | null;
};

/**
 * Construct a rolling FPS counter.  Defaults to a 60-frame window.
 *
 * Implementation: ring buffer of timestamps.  We store *timestamps* (not
 * deltas) because then the first sample after construction is just an
 * insert — no special-case "is this the very first frame?" branch.  The
 * mean delta is computed lazily on each `sample()` from the oldest and
 * newest stored timestamps divided by (n - 1) gaps, which is cheaper
 * than maintaining a running sum-of-deltas (one subtraction vs. an
 * add-and-subtract per sample).
 */
export function createFpsCounter(windowFrames = 60): FpsCounter {
  if (windowFrames < 2) {
    throw new Error(`fpsCounter window must be ≥ 2 frames (got ${windowFrames})`);
  }

  // Ring buffer.  We pre-allocate to avoid array growth churn on the hot
  // path; `count` tracks the number of valid entries (0..windowFrames).
  // `nextIdx` is the write cursor (mod windowFrames).
  const buf = new Float64Array(windowFrames);
  let count = 0;
  let nextIdx = 0;

  return {
    sample(nowMs: number): number | null {
      buf[nextIdx] = nowMs;
      nextIdx = (nextIdx + 1) % windowFrames;
      if (count < windowFrames) count++;

      if (count < 2) return null;

      // Locate oldest and newest stored timestamps without iterating.
      // After `nextIdx` advances, the slot at the *new* `nextIdx` is the
      // oldest entry (still pre-overwrite if the buffer is full).  When
      // not yet full, slot 0 is oldest.
      const oldestIdx = count < windowFrames ? 0 : nextIdx;
      const newestIdx = (nextIdx - 1 + windowFrames) % windowFrames;
      const span = buf[newestIdx]! - buf[oldestIdx]!;
      if (span <= 0) return null;
      // (count - 1) gaps span N timestamps.
      const meanDeltaMs = span / (count - 1);
      return Math.round(1000 / meanDeltaMs);
    },
  };
}
