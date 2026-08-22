/**
 * declutterByScreenSeparation — a pure, greedy screen-space priority cull for
 * a set of already-projected label anchors: sort by priority, then keep a
 * candidate only when it clears every higher-priority survivor by a minimum
 * pixel separation. Returns the kept indices, highest-priority first.
 *
 * ### Why a pure function, not inline in the director
 *
 * `label2DDirector`'s `screenSeparation` declutter arm (NEAR0) calls this
 * against its own already-projected candidates. It takes screen positions +
 * priorities (not a camera or a vp), so it unit-tests headlessly, independent
 * of the director's projection and merge machinery.
 *
 * ### Why priority = apparent size
 *
 * When two captions collide, the one for the nearer / brighter star is the one
 * worth keeping — its subject is the visually dominant object, and the distant
 * star behind it is exactly the clutter to drop. Apparent size (bigger when
 * near / large) is that signal, so the caller passes each candidate's apparent
 * size as `priorityPx`. This mirrors the director's own rationale for sorting
 * its declutter by prominence (`label2DDirector.ts`) — the higher
 * `prominencePx`/apparent-size wins an overlap.
 *
 * The sort is a stable priority-DESC ordering (equal priorities keep input
 * order — the director's tiebreak convention), so the result is deterministic.
 */

import type { Vec2 } from '../../@types/math/Vec2';

export function declutterByScreenSeparation(input: {
  /** Projected screen positions + priority (apparent size / -distance). */
  candidates: readonly { screenPx: Vec2; priorityPx: number }[];
  /** Minimum pixel gap a kept candidate must clear from every survivor. */
  minSeparationPx: number;
}): readonly number[] {
  const { candidates, minSeparationPx } = input;

  // Priority-DESC order over the ORIGINAL indices. Array.prototype.sort is
  // stable, so sorting an ascending index array by priority leaves equal
  // priorities in input order — the director's stable tiebreak.
  const order = candidates.map((_, i) => i);
  order.sort((a, b) => candidates[b]!.priorityPx - candidates[a]!.priorityPx);

  const kept: number[] = [];
  const minSepSq = minSeparationPx * minSeparationPx;
  for (const idx of order) {
    const [x, y] = candidates[idx]!.screenPx;
    // Accept only when this candidate clears every already-accepted survivor
    // by at least the separation. Squared distance avoids the per-pair sqrt.
    let clears = true;
    for (const keptIdx of kept) {
      const [kx, ky] = candidates[keptIdx]!.screenPx;
      const dx = x - kx;
      const dy = y - ky;
      if (dx * dx + dy * dy < minSepSq) {
        clears = false;
        break;
      }
    }
    if (clears) kept.push(idx);
  }
  return kept;
}
