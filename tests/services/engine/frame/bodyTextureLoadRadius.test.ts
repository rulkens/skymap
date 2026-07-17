/**
 * bodyTextureLoadRadius — pins the one load-bearing property of the per-body
 * texture-demand radius: it TRACKS the body's seeded radius, so a bigger body
 * begins loading its texture from farther out.
 *
 * The assertion is the monotonic relation against the seeded radii (Jupiter is
 * the largest textured body, Mercury one of the smallest), not a pinned Mpc
 * value — the exact figure is a product of `KM_TO_MPC` and the selectivity-tuned
 * multiplier, neither of which a test should restate. A regression
 * that decouples the radius from the seed (a hand-typed literal, a swapped
 * lookup) breaks the ordering and fails here.
 */

import { describe, it, expect } from 'vitest';

import { loadRadiusMpc } from '../../../../src/services/engine/frame/bodyTextureLoadRadius';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';

describe('loadRadiusMpc', () => {
  it('scales with body radius', () => {
    const jupiter = loadRadiusMpc('jupiter');
    const mercury = loadRadiusMpc('mercury');

    expect(jupiter).toBeGreaterThan(mercury);

    for (const value of [jupiter, mercury]) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('stays selective between neighbouring planets', () => {
    // Approaching Earth must not fire Mars's texture demand: the gate has to be
    // tighter than the seeded Earth–Mars separation, or the per-body proximity
    // scheme collapses into loading every body at once.
    const earth = findByIdOrThrow(SCENE_BODIES, 'earth', 'test');
    const mars = findByIdOrThrow(SCENE_BODIES, 'mars', 'test');
    const earthMarsMpc = Math.hypot(
      earth.positionMpc[0] - mars.positionMpc[0],
      earth.positionMpc[1] - mars.positionMpc[1],
      earth.positionMpc[2] - mars.positionMpc[2],
    );

    expect(loadRadiusMpc('earth')).toBeLessThan(earthMarsMpc);
  });
});
