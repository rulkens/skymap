/**
 * loadFadeAlpha — linear 0→1 ramp over `durationMs` since a resource became
 * ready, with `undefined` meaning "not ready yet" → 0.
 *
 * The textured-disk planner fades a thumbnail in once its bitmap lands: it
 * stamps `bitmapReadyTime[key] = now` on arrival, then each frame ramps the
 * alpha from that stamp. `tReady === undefined` is the not-yet-loaded case
 * (no stamp), which must read as fully transparent rather than NaN.
 *
 * Linear, not smoothstep: this composes (multiplies) with the smoothstep
 * distance fade, so easing both would double-ease the handoff. Kept pure and
 * named so the ramp is testable without a planner or a clock.
 */
export function loadFadeAlpha(
  tReady: number | undefined,
  nowMs: number,
  durationMs: number,
): number {
  if (tReady === undefined) return 0;
  return Math.min(1, (nowMs - tReady) / durationMs);
}
