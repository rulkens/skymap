/**
 * isNearStar — the near/far star partition.
 *
 * The load-bearing property is the split over the REAL seed table: exactly
 * one near star (the Sun, at the heliocentric origin) and every real
 * neighbour — starting with Proxima Centauri at ~1.301 pc — on the far
 * side. Testing against `SCENE_STARS` (not synthetic fixtures) pins the
 * partition the renderer actually ships: a re-tune of the threshold or a
 * new seed row that accidentally lands inside it fails here first.
 */

import { describe, it, expect } from 'vitest';
import { isNearStar } from '../../../src/utils/scene/isNearStar';
import { SCENE_STARS } from '../../../src/data/bodies/sceneBodies';

describe('isNearStar', () => {
  it('puts the Sun (distance 0) in the near partition', () => {
    const sun = SCENE_STARS.find((star) => star.id === 'sun')!;
    expect(isNearStar(sun)).toBe(true);
  });

  it('puts Proxima Centauri (~1.301 pc, the nearest real star) in the far partition', () => {
    const proxima = SCENE_STARS.find((star) => star.id === 'proxima-centauri')!;
    expect(isNearStar(proxima)).toBe(false);
  });

  it('partitions the full seed table into the Sun vs. everything else', () => {
    const near = SCENE_STARS.filter(isNearStar);
    const far = SCENE_STARS.filter((star) => !isNearStar(star));
    expect(near.map((star) => star.id)).toEqual(['sun']);
    expect(far).toHaveLength(SCENE_STARS.length - 1);
  });
});
