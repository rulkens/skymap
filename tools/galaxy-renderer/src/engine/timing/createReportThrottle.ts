/**
 * createReportThrottle — "has `intervalMs` passed since the last time this
 * said yes?", for a readout that drives React state and so must not be
 * dispatched per frame.
 *
 * `due` stamps only when it answers true, so a caller may short-circuit ahead
 * of it (nothing to publish yet) without consuming the interval.
 */

/** @param intervalMs how long between two `true` answers. */
export function createReportThrottle(intervalMs: number): { due(nowMs: number): boolean } {
  // 0, not the construction time: the first frame should report immediately
  // rather than after one interval of an empty readout.
  let lastMs = 0;

  return {
    due(nowMs: number): boolean {
      if (nowMs - lastMs < intervalMs) return false;
      lastMs = nowMs;
      return true;
    },
  };
}
