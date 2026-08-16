/**
 * loopCycleFrameCount — frames in one seamless cycle of a looping clip.
 *
 * `record.ts` uses this as the STOP CONDITION for a `loop: true` clip instead
 * of polling the clip-end promise, which never resolves for a loop (see
 * docs/grill-sessions/record-clip-looping-clips-2026-08-16.md, Q2). Rounding
 * to the nearest frame (not floor/ceil) trades a sub-frame seam offset —
 * negligible at these camera speeds — for never erroring on an off-grid
 * cycle length (Q4).
 */
export function loopCycleFrameCount(durationSec: number, fps: number): number {
  return Math.round(durationSec * fps);
}
