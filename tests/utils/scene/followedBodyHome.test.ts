/**
 * followedBodyHome — unit tests for the composition-home target builder.
 *
 * The static-anchor case is the load-bearing one: the day a composition's
 * home points at a body the follow driver cannot track (a `famousStars`
 * anchor like the Sun, absent from `ORBITAL_ELEMENTS`), the focus-tween saga
 * would silently tween the camera to it instead of the follow driver picking
 * it up. This is the test that fails that day.
 */

import { describe, it, expect } from 'vitest';

import { followedBodyHome } from '../../../src/utils/scene/followedBodyHome';
import { EARTH_REF } from '../../../src/data/selection/earthRef';

describe('followedBodyHome', () => {
  it('followedBodyHome returns the target for a body the sim clock propagates', () => {
    expect(followedBodyHome(EARTH_REF).ref).toBe(EARTH_REF);
  });

  it('followedBodyHome throws for a static anchor body', () => {
    expect(() => followedBodyHome({ type: 'body', id: 'sun' })).toThrow();
  });
});
