/**
 * FpsCounter — rolling-window FPS estimator for the engine's per-frame
 * loop.  See `services/engine/subsystems/fpsCounter.ts` for the
 * implementation and the window-size / instantaneous-vs-EMA rationale.
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
