/**
 * chainOverlapViolations — the painter-order invariant (spec §7.2): for any
 * pair of chain rows whose SCREEN bounding circles overlap, their
 * `distanceRangeM` intervals must be disjoint. Rows that don't overlap on
 * screen can't paint over each other, so their depth order doesn't matter —
 * Jupiter and Io overlap in distance at quadrature every frame while sitting
 * apart on screen, and that's fine. O(N²) over ≤27 rows: cheap enough to run
 * every frame in dev.
 */

import type { ChainRow } from '../../@types/scene/ChainRow';

export function chainOverlapViolations(
  rows: readonly ChainRow[],
): readonly (readonly [number, number])[] {
  const violations: (readonly [number, number])[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      const dx = a.centrePx[0] - b.centrePx[0];
      const dy = a.centrePx[1] - b.centrePx[1];
      const screensOverlap = Math.hypot(dx, dy) <= a.radiusPx + b.radiusPx;
      const intervalsOverlap =
        a.distanceRangeM[0] <= b.distanceRangeM[1] && b.distanceRangeM[0] <= a.distanceRangeM[1];
      if (screensOverlap && intervalsOverlap) {
        violations.push([a.index, b.index]);
      }
    }
  }
  return violations;
}
