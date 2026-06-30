/**
 * strideWindow — the per-source slice a disk planner walks this frame, plus the
 * cursor to resume from next frame.
 *
 * The disk planners decimate: rather than test all `count` rows of a catalog
 * every frame, each frame walks a contiguous window of `ceil(count /
 * decimationFactor)` rows and advances a per-source cursor, so the whole catalog
 * is covered every `decimationFactor` frames. This is the stride-decimation that
 * keeps the per-frame scan bounded (PR #79).
 *
 * `start` is the resume cursor. It's clamped to 0 when stale (`>= count`, e.g.
 * after the catalog shrank on a tier switch) so the window never starts out of
 * range. `nextStart` wraps to 0 once the window reaches the end, ready for the
 * next pass.
 *
 * Pure so the wrap/clamp arithmetic is testable without a planner; both planners
 * share it instead of re-deriving the same four lines.
 */
export function strideWindow(
  count: number,
  decimationFactor: number,
  start: number,
): { safeStart: number; end: number; nextStart: number } {
  const stride = Math.max(1, Math.ceil(count / decimationFactor));
  const safeStart = start >= count ? 0 : start;
  const end = Math.min(safeStart + stride, count);
  const nextStart = end >= count ? 0 : end;
  return { safeStart, end, nextStart };
}
