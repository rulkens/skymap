/**
 * declutterByScreenSeparation — the greedy screen-space priority cull.
 *
 * The load-bearing behaviour: when several captions pile within the minimum
 * separation, only the HIGHEST-priority one of the cluster survives, and a
 * candidate that clears every survivor is always kept. That is the whole point
 * of the cull — it de-collides the foreground star captions so the near/bright
 * star's name wins the overlap and the distant clutter drops.
 */

import { describe, it, expect } from 'vitest';

import { declutterByScreenSeparation } from '../../../src/utils/scene/declutterByScreenSeparation';
import type { Vec2 } from '../../../src/@types/math/Vec2';

describe('declutterByScreenSeparation', () => {
  it('keeps the highest-priority of an overlapping cluster', () => {
    // Three captions pile inside 20 px of each other (a cluster), plus one
    // well-separated 500 px away. Priorities differ within the cluster.
    const candidates: readonly { screenPx: Vec2; priorityPx: number }[] = [
      { screenPx: [100, 100], priorityPx: 2 }, // cluster, mid priority
      { screenPx: [108, 104], priorityPx: 9 }, // cluster, TOP priority
      { screenPx: [95, 110], priorityPx: 5 }, // cluster, low priority
      { screenPx: [600, 100], priorityPx: 1 }, // isolated — always survives
    ];

    const kept = declutterByScreenSeparation({ candidates, minSeparationPx: 40 });

    // The cluster collapses to its single top-priority member (index 1); the
    // isolated candidate (index 3) is kept regardless of its low priority.
    // Result is priority-DESC: the top-priority survivor comes first.
    expect(kept).toEqual([1, 3]);
  });

  it('keeps every candidate when all are well separated', () => {
    const candidates: readonly { screenPx: Vec2; priorityPx: number }[] = [
      { screenPx: [0, 0], priorityPx: 1 },
      { screenPx: [200, 0], priorityPx: 3 },
      { screenPx: [0, 200], priorityPx: 2 },
    ];
    const kept = declutterByScreenSeparation({ candidates, minSeparationPx: 50 });
    // All survive; order is priority-DESC (3, 2, 1 → indices 1, 2, 0).
    expect([...kept].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(kept[0]).toBe(1); // highest priority first
  });
});
