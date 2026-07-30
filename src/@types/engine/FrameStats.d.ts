/**
 * FrameStats — the always-on CPU-side frame readout the DebugPanel shows
 * regardless of whether GPU timing is enabled.
 *
 * `fps` is the EMA-smoothed frame rate (rounded for display); `cpuMs` is the
 * EMA-smoothed duration of the JS frame body (loop entry → after submit), the
 * "am I CPU-bound?" number; `idle` is true when the render-on-demand loop is
 * asleep (no frame within IDLE_GAP_MS) — the panel shows "idle" instead of a
 * stale fps.
 */
export type FrameStats = { fps: number; cpuMs: number; idle: boolean };
