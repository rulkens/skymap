/**
 * purgeStrideWindow — drop the sticky-map entries the current stride window is
 * about to re-author.
 *
 * The disk planners keep a per-source sticky map (row index → emitted instance)
 * that persists across frames, so galaxies outside this frame's stride window
 * stay rendered from a prior pass. The rows *inside* the window
 * `[safeStart, end)` are re-evaluated this frame and become authoritative again,
 * so their stale entries must be cleared first — otherwise a galaxy that drops
 * out of the emit gate (e.g. fades below the size threshold) would keep its old
 * instance forever.
 *
 * Mutates `map` in place (it's the planner's persistent state); collects the
 * doomed keys before deleting so we don't mutate the map mid-iteration. Shared
 * by both planners so the window/sticky contract lives in one place.
 */
export function purgeStrideWindow<V>(map: Map<number, V>, safeStart: number, end: number): void {
  const drop: number[] = [];
  for (const k of map.keys()) {
    if (k >= safeStart && k < end) drop.push(k);
  }
  for (const k of drop) map.delete(k);
}
