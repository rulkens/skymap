/**
 * flowFrameDeltaSec — elapsed seconds since the flow renderer's previous
 * `encodeCompute` call, clamped to a GPU-safe window.
 *
 * `lastNowMs === null` means no prior frame is known (construction, or the
 * layer having been off) — returning 0 skips advection for exactly one frame
 * rather than inventing an elapsed time. The upper clamp stops a
 * backgrounded-then-resumed tab from teleporting every particle in one step;
 * the lower clamp defends against a non-monotonic clock.
 */

import { MAX_FRAME_DELTA_SEC } from '../data/flow/flowFieldConstants';

export function flowFrameDeltaSec(nowMs: number, lastNowMs: number | null): number {
  if (lastNowMs === null) return 0;
  const dtSec = (nowMs - lastNowMs) / 1000;
  return Math.max(0, Math.min(MAX_FRAME_DELTA_SEC, dtSec));
}
